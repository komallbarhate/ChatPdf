"""
RAG Engine -- Enhanced with multi-doc, entity extraction, mind-map, timeline & study mode.
"""

import os
import re
import uuid
import time
import json
import numpy as np
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional, Tuple

import pypdf
from sentence_transformers import SentenceTransformer
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# ──────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────

CHUNK_SIZE      = 500
CHUNK_OVERLAP   = 80
TOP_K           = 6
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
# ── Model Fallback Chain ──────────────────────────────────
# System tries each model in order. If one is rate-limited (429),
# it automatically falls back to the next one silently.
MODEL_CHAIN = [
    "llama-3.3-70b-versatile",   # Best quality  — 100K tokens/day
    "llama-3.1-70b-versatile",   # Same quality  — 100K tokens/day (separate quota)
    "llama-3.1-8b-instant",      # Fast & light  — 500K tokens/day
    "gemma2-9b-it",              # Google model  — 500K tokens/day
    "mixtral-8x7b-32768",        # Mixtral       — 500K tokens/day
]
UPLOAD_DIR      = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


# ──────────────────────────────────────────
#  Data Models
# ──────────────────────────────────────────

@dataclass
class Chunk:
    text: str
    page: int
    chunk_idx: int
    doc_id: str
    filename: str = ""   # for cross-doc citation

@dataclass
class DocumentMeta:
    doc_id: str
    filename: str
    num_pages: int
    num_chunks: int
    upload_time: float
    file_size_kb: float
    summary_snippet: str = ""


# ──────────────────────────────────────────
#  PDF Processor
# ──────────────────────────────────────────

class PDFProcessor:
    @staticmethod
    def extract(pdf_path: str) -> Tuple[str, int, Dict[int, str]]:
        page_texts: Dict[int, str] = {}
        full_parts: List[str] = []
        with open(pdf_path, "rb") as f:
            reader = pypdf.PdfReader(f)
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                text = re.sub(r'\n{3,}', '\n\n', text)
                text = re.sub(r' {2,}', ' ', text)
                text = text.strip()
                page_texts[i + 1] = text
                if text:
                    full_parts.append(text)
        return "\n\n".join(full_parts), len(reader.pages), page_texts


# ──────────────────────────────────────────
#  Text Chunker
# ──────────────────────────────────────────

class TextChunker:
    @staticmethod
    def chunk_pages(page_texts: Dict[int, str], doc_id: str, filename: str = "") -> List[Chunk]:
        chunks: List[Chunk] = []
        chunk_idx = 0
        for page_num, text in page_texts.items():
            if not text.strip():
                continue
            words = text.split()
            start = 0
            while start < len(words):
                end = min(start + CHUNK_SIZE, len(words))
                chunk_text = " ".join(words[start:end])
                if len(chunk_text.strip()) > 30:
                    chunks.append(Chunk(
                        text=chunk_text,
                        page=page_num,
                        chunk_idx=chunk_idx,
                        doc_id=doc_id,
                        filename=filename,
                    ))
                    chunk_idx += 1
                if end == len(words):
                    break
                start += CHUNK_SIZE - CHUNK_OVERLAP
        return chunks


# ──────────────────────────────────────────
#  Embedding Store
# ──────────────────────────────────────────

class EmbeddingStore:
    _model: Optional[SentenceTransformer] = None

    def __init__(self):
        if EmbeddingStore._model is None:
            print(f"[EmbeddingStore] Loading model: {EMBEDDING_MODEL} ...")
            EmbeddingStore._model = SentenceTransformer(EMBEDDING_MODEL)
            print("[EmbeddingStore] Model ready OK")
        self.model = EmbeddingStore._model
        self._stores: Dict[str, Dict] = {}

    def add_document(self, doc_id: str, chunks: List[Chunk]) -> None:
        texts = [c.text for c in chunks]
        embeddings = self.model.encode(texts, show_progress_bar=False,
                                       batch_size=32, normalize_embeddings=True)
        self._stores[doc_id] = {
            "embeddings": np.array(embeddings, dtype="float32"),
            "chunks": chunks,
        }
        print(f"[EmbeddingStore] Indexed {len(chunks)} chunks for {doc_id}")

    def remove_document(self, doc_id: str) -> None:
        self._stores.pop(doc_id, None)

    def retrieve(self, doc_id: str, query: str, top_k: int = TOP_K) -> List[Chunk]:
        if doc_id not in self._stores:
            return []
        return self._search(self._stores[doc_id], query, top_k)

    def retrieve_global(self, query: str, doc_ids: Optional[List[str]] = None,
                        top_k: int = 10) -> List[Chunk]:
        """Search across ALL (or selected) documents."""
        all_chunks, all_embeddings = [], []
        ids = doc_ids if doc_ids else list(self._stores.keys())
        for did in ids:
            if did not in self._stores:
                continue
            store = self._stores[did]
            all_chunks.extend(store["chunks"])
            all_embeddings.append(store["embeddings"])
        if not all_chunks:
            return []
        combined = np.vstack(all_embeddings)
        q_emb = np.array(self.model.encode([query], normalize_embeddings=True), dtype="float32")
        scores = (combined @ q_emb.T).flatten()
        top_idx = np.argsort(scores)[::-1][:top_k]
        return [all_chunks[i] for i in top_idx]

    def _search(self, store: Dict, query: str, top_k: int) -> List[Chunk]:
        q_emb = np.array(self.model.encode([query], normalize_embeddings=True), dtype="float32")
        scores = (store["embeddings"] @ q_emb.T).flatten()
        k = min(top_k, len(store["chunks"]))
        top_idx = np.argsort(scores)[::-1][:k]
        return [store["chunks"][i] for i in top_idx]

    def has_document(self, doc_id: str) -> bool:
        return doc_id in self._stores


# ──────────────────────────────────────────
#  Groq LLM Client
# ──────────────────────────────────────────

class GroqLLMClient:
    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY", "")
        if not api_key or api_key == "your_groq_api_key_here":
            raise ValueError(
                "GROQ_API_KEY not set. Add your free key to the .env file.\n"
                "Get a free key at: https://console.groq.com/keys"
            )
        self.client = Groq(api_key=api_key)
        self.current_model = MODEL_CHAIN[0]   # start with best model
        self._chain_idx   = 0                 # tracks which model we're on
        print(f"[LLM] Primary model: {self.current_model}")
        print(f"[LLM] Fallback chain: {' → '.join(MODEL_CHAIN[1:])}")

    def generate(self, system_prompt: str, user_message: str,
                 temperature: float = 0.3, max_tokens: int = 2048) -> str:
        """
        Try each model in MODEL_CHAIN. If one returns 429 (rate limit),
        automatically fall back to the next model.
        """
        # Always start from the current successful model, not from index 0
        for idx in range(self._chain_idx, len(MODEL_CHAIN)):
            model = MODEL_CHAIN[idx]
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_message},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                # Success — remember this model for next calls
                if model != self.current_model:
                    print(f"[LLM] ✓ Now using: {model}")
                    self.current_model = model
                    self._chain_idx    = idx
                return response.choices[0].message.content

            except Exception as e:
                err_str = str(e)
                is_rate_limit = ("429" in err_str or "rate_limit" in err_str.lower()
                                 or "quota" in err_str.lower())
                if is_rate_limit and idx + 1 < len(MODEL_CHAIN):
                    next_model = MODEL_CHAIN[idx + 1]
                    print(f"[LLM] ⚠ Rate limit on '{model}' → switching to '{next_model}'")
                    continue   # try next model in chain
                elif is_rate_limit:
                    # All models exhausted
                    return ("LLM Error: All models are currently rate-limited. "
                            "Please wait a few minutes and try again.")
                else:
                    return f"LLM Error: {err_str}"

        return "LLM Error: No models available."

    def generate_json(self, system_prompt: str, user_message: str,
                      max_tokens: int = 3000) -> dict:
        """Generate and parse a JSON response."""
        raw = self.generate(system_prompt, user_message,
                            temperature=0.1, max_tokens=max_tokens)
        # Extract JSON block from response
        match = re.search(r'```json\s*([\s\S]*?)\s*```', raw)
        if match:
            raw = match.group(1)
        else:
            # Try to find first { or [
            m = re.search(r'(\{[\s\S]*\}|\[[\s\S]*\])', raw)
            if m:
                raw = m.group(1)
        try:
            return json.loads(raw)
        except Exception:
            return {"error": "Failed to parse JSON", "raw": raw}


# ──────────────────────────────────────────
#  RAG Chain (single-doc + cross-doc)
# ──────────────────────────────────────────

CHAT_SYSTEM = """You are an expert AI assistant answering questions based ONLY on provided document excerpts.

Rules:
1. Answer using ONLY the information in the context below.
2. If the answer is not found, say exactly: "I couldn't find this in the provided documents."
3. ALWAYS cite sources: mention the document name and page number.
4. Be precise, clear, and well-structured with markdown formatting.
5. For MCQs: create 5 questions with 4 options (A/B/C/D) and mark the correct answer.
6. For summaries: be comprehensive but concise.
"""

def build_context(chunks: List[Chunk], query: str) -> str:
    parts = []
    for c in chunks:
        label = f"[{c.filename or 'Document'} — Page {c.page}]"
        parts.append(f"{label}\n{c.text}")
    context = "\n\n---\n\n".join(parts)
    return f"DOCUMENT EXCERPTS:\n{context}\n\n---\n\nQUESTION: {query}\n\nAnswer with citations (document name + page number):"


class RAGChain:
    def __init__(self, embedding_store: EmbeddingStore, llm: GroqLLMClient):
        self.store = embedding_store
        self.llm = llm

    def query(self, doc_id: str, question: str) -> Dict:
        chunks = self.store.retrieve(doc_id, self._enhance(question))
        if not chunks:
            return {"answer": "No relevant content found.", "sources": [], "citations": []}
        answer = self.llm.generate(CHAT_SYSTEM, build_context(chunks, question))
        return {
            "answer": answer,
            "sources": sorted(set(c.page for c in chunks)),
            "citations": [{"filename": c.filename, "page": c.page, "snippet": c.text[:200]} for c in chunks],
            "chunks_used": len(chunks),
        }

    def query_multi(self, question: str, doc_ids: Optional[List[str]] = None) -> Dict:
        """Cross-document RAG query."""
        chunks = self.store.retrieve_global(self._enhance(question), doc_ids, top_k=12)
        if not chunks:
            return {"answer": "No relevant content found across documents.", "sources": [], "citations": []}
        answer = self.llm.generate(CHAT_SYSTEM, build_context(chunks, question))
        return {
            "answer": answer,
            "sources": sorted(set(c.page for c in chunks)),
            "citations": [{"filename": c.filename, "page": c.page, "snippet": c.text[:200]} for c in chunks],
            "chunks_used": len(chunks),
        }

    @staticmethod
    def _enhance(question: str) -> str:
        q = question.lower().strip()
        if q in ("summarize", "summarize this", "summarize this document", "tldr"):
            return "main topics overview introduction conclusion key points summary"
        if "mcq" in q or "multiple choice" in q:
            return "key concepts facts definitions important points"
        m = re.search(r'chapter\s+(\d+)', q)
        if m:
            return f"chapter {m.group(1)} content topics"
        return question


# ──────────────────────────────────────────
#  Knowledge Graph Extractor
# ──────────────────────────────────────────

KG_SYSTEM = """You are an expert knowledge graph extractor.
Extract entities and relationships from the text and return ONLY valid JSON in this exact format:
{
  "nodes": [
    {"id": "unique_id", "label": "Entity Name", "type": "Person|Organization|Technology|Concept|Date|Location|Other", "description": "brief description"}
  ],
  "edges": [
    {"source": "source_id", "target": "target_id", "label": "relationship description"}
  ]
}
Extract 15-30 nodes and 15-40 edges. Focus on the most important entities and their key relationships.
Return ONLY the JSON object, no other text."""

def extract_knowledge_graph(llm: GroqLLMClient, chunks: List[Chunk]) -> Dict:
    text = "\n\n".join(c.text for c in chunks[:15])
    return llm.generate_json(KG_SYSTEM, f"Extract knowledge graph from:\n\n{text}", max_tokens=4000)


# ──────────────────────────────────────────
#  Mind Map Generator
# ──────────────────────────────────────────

MINDMAP_SYSTEM = """You are an expert mind map creator.
Create a hierarchical mind map from the document and return ONLY valid JSON:
{
  "name": "Central Topic",
  "children": [
    {
      "name": "Main Branch 1",
      "children": [
        {"name": "Sub-topic 1.1", "children": []},
        {"name": "Sub-topic 1.2", "children": []}
      ]
    }
  ]
}
Create 4-6 main branches with 3-5 sub-topics each. Max depth: 3 levels.
Return ONLY the JSON object, no other text."""

def generate_mind_map(llm: GroqLLMClient, chunks: List[Chunk]) -> Dict:
    text = "\n\n".join(c.text for c in chunks[:12])
    return llm.generate_json(MINDMAP_SYSTEM, f"Create mind map from:\n\n{text}", max_tokens=3000)


# ──────────────────────────────────────────
#  Timeline Extractor
# ──────────────────────────────────────────

TIMELINE_SYSTEM = """You are an expert timeline extractor.
Extract EVERY event with a date or time reference from the text and return ONLY valid JSON:
{
  "title": "Document Timeline",
  "events": [
    {
      "date": "YYYY or YYYY-MM or YYYY-MM-DD",
      "title": "Event Title",
      "description": "Full description of the event with context",
      "category": "Historical|Scientific|Political|Personal|Technical|Other"
    }
  ]
}
Rules:
- Include EVERY date/event mentioned — do not skip any.
- Sort events chronologically by date.
- Use "Unknown" for dates that cannot be determined.
- Write detailed descriptions (2-3 sentences each).
Return ONLY the JSON object, no other text."""

def extract_timeline(llm: GroqLLMClient, chunks: List[Chunk]) -> Dict:
    text = "\n\n".join(c.text for c in chunks[:20])  # use more chunks
    return llm.generate_json(TIMELINE_SYSTEM, f"Extract ALL events and dates from:\n\n{text}", max_tokens=8000)


# ──────────────────────────────────────────
#  Study Mode Generator
# ──────────────────────────────────────────

STUDY_SYSTEM = """You are an expert educator creating study materials.
Generate comprehensive study materials and return ONLY valid JSON:
{
  "flashcards": [
    {"front": "Question or Term", "back": "Answer or Definition", "difficulty": "easy|medium|hard"}
  ],
  "mcqs": [
    {
      "question": "Question text",
      "options": {"A": "option", "B": "option", "C": "option", "D": "option"},
      "answer": "A",
      "explanation": "Why this is correct",
      "difficulty": "easy|medium|hard"
    }
  ],
  "fill_blanks": [
    {"sentence": "The ___ is responsible for ___.", "answers": ["word1", "word2"], "difficulty": "easy|medium|hard"}
  ],
  "viva_questions": [
    {"question": "Explain...", "key_points": ["point1", "point2"], "difficulty": "easy|medium|hard"}
  ]
}
Generate: 8 flashcards, 5 MCQs, 5 fill-in-the-blanks, 5 viva questions. Mix all difficulty levels.
Return ONLY the JSON object, no other text."""

def generate_study_materials(llm: GroqLLMClient, chunks: List[Chunk]) -> Dict:
    text = "\n\n".join(c.text for c in chunks[:12])
    return llm.generate_json(STUDY_SYSTEM, f"Create study materials from:\n\n{text}", max_tokens=4000)


# ──────────────────────────────────────────
#  Document Manager
# ──────────────────────────────────────────

class DocumentManager:
    def __init__(self):
        self.embedding_store = EmbeddingStore()
        self.llm = GroqLLMClient()
        self.rag = RAGChain(self.embedding_store, self.llm)
        self._docs: Dict[str, DocumentMeta] = {}
        self._chunks: Dict[str, List[Chunk]] = {}

    def ingest(self, pdf_path: str, filename: str) -> DocumentMeta:
        doc_id = str(uuid.uuid4())[:8]
        file_size_kb = round(os.path.getsize(pdf_path) / 1024, 1)
        full_text, num_pages, page_texts = PDFProcessor.extract(pdf_path)
        chunks = TextChunker.chunk_pages(page_texts, doc_id, filename)
        self.embedding_store.add_document(doc_id, chunks)
        self._chunks[doc_id] = chunks
        snippet = full_text[:200].replace("\n", " ").strip() + "..."
        meta = DocumentMeta(doc_id=doc_id, filename=filename, num_pages=num_pages,
                            num_chunks=len(chunks), upload_time=time.time(),
                            file_size_kb=file_size_kb, summary_snippet=snippet)
        self._docs[doc_id] = meta
        return meta

    def remove(self, doc_id: str) -> bool:
        if doc_id not in self._docs:
            return False
        self.embedding_store.remove_document(doc_id)
        self._docs.pop(doc_id)
        self._chunks.pop(doc_id, None)
        for f in UPLOAD_DIR.glob(f"{doc_id}_*"):
            f.unlink(missing_ok=True)
        return True

    def list_docs(self) -> List[Dict]:
        return [asdict(m) for m in self._docs.values()]

    def get_doc(self, doc_id: str) -> Optional[DocumentMeta]:
        return self._docs.get(doc_id)

    def chat(self, doc_id: str, question: str) -> Dict:
        if doc_id not in self._docs:
            return {"error": "Document not found."}
        return self.rag.query(doc_id, question)

    def chat_multi(self, question: str, doc_ids: Optional[List[str]] = None) -> Dict:
        return self.rag.query_multi(question, doc_ids)

    def get_knowledge_graph(self, doc_id: str) -> Dict:
        chunks = self._get_chunks(doc_id)
        return extract_knowledge_graph(self.llm, chunks)

    def get_mind_map(self, doc_id: str) -> Dict:
        chunks = self._get_chunks(doc_id)
        return generate_mind_map(self.llm, chunks)

    def get_timeline(self, doc_id: str) -> Dict:
        chunks = self._get_chunks(doc_id)
        return extract_timeline(self.llm, chunks)

    def get_study_materials(self, doc_id: str) -> Dict:
        chunks = self._get_chunks(doc_id)
        return generate_study_materials(self.llm, chunks)

    def _get_chunks(self, doc_id: str) -> List[Chunk]:
        if doc_id == "all":
            result = []
            for chunks in self._chunks.values():
                result.extend(chunks)
            return result
        return self._chunks.get(doc_id, [])
