"""
RAG Engine -- Core pipeline for PDF processing, embedding, retrieval.
Handles: PDF parsing -> chunking -> embedding -> numpy vector search -> retrieval
Uses pypdf (pure Python) + numpy cosine similarity -- no C++ compilation needed.
"""

import os
import re
import uuid
import time
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

CHUNK_SIZE      = 500   # words per chunk
CHUNK_OVERLAP   = 80    # overlapping words between chunks
TOP_K           = 6     # top-k chunks to retrieve
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
GROQ_MODEL      = "llama-3.3-70b-versatile"   # free, fast, capable
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
#  PDF Processor  (pypdf — pure Python)
# ──────────────────────────────────────────

class PDFProcessor:
    """Extracts clean text from PDF files page by page using pypdf."""

    @staticmethod
    def extract(pdf_path: str) -> Tuple[str, int, Dict[int, str]]:
        """
        Returns:
            full_text      : entire document text
            num_pages      : page count
            page_texts     : {page_num (1-based): text}
        """
        page_texts: Dict[int, str] = {}
        full_parts: List[str] = []

        with open(pdf_path, "rb") as f:
            reader = pypdf.PdfReader(f)
            for i, page in enumerate(reader.pages):
                text = page.extract_text() or ""
                # Clean whitespace artifacts
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
    """Sliding-window word-based chunking with page attribution."""

    @staticmethod
    def chunk_pages(page_texts: Dict[int, str], doc_id: str) -> List[Chunk]:
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
                if len(chunk_text.strip()) > 30:   # skip tiny fragments
                    chunks.append(Chunk(
                        text=chunk_text,
                        page=page_num,
                        chunk_idx=chunk_idx,
                        doc_id=doc_id,
                    ))
                    chunk_idx += 1
                if end == len(words):
                    break
                start += CHUNK_SIZE - CHUNK_OVERLAP

        return chunks


# ──────────────────────────────────────────
#  Embedding Store (numpy cosine similarity)
# ──────────────────────────────────────────

class EmbeddingStore:
    """
    Manages sentence-transformer embeddings with numpy-based cosine similarity.
    No FAISS / no C++ needed — works on any Python version.
    """

    _model: Optional[SentenceTransformer] = None   # shared singleton

    def __init__(self):
        if EmbeddingStore._model is None:
            print(f"[EmbeddingStore] Loading model: {EMBEDDING_MODEL} …")
            EmbeddingStore._model = SentenceTransformer(EMBEDDING_MODEL)
            print("[EmbeddingStore] Model ready OK")

        self.model = EmbeddingStore._model
        # doc_id → {"embeddings": np.ndarray (N, D), "chunks": List[Chunk]}
        self._stores: Dict[str, Dict] = {}

    def add_document(self, doc_id: str, chunks: List[Chunk]) -> None:
        texts = [c.text for c in chunks]
        embeddings = self.model.encode(
            texts,
            show_progress_bar=False,
            batch_size=32,
            normalize_embeddings=True,   # unit-norm → dot product = cosine
        )
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
        store = self._stores[doc_id]
        q_emb = self.model.encode([query], normalize_embeddings=True)
        q_emb = np.array(q_emb, dtype="float32")   # shape (1, D)

        # Cosine similarity via dot product (embeddings are unit-normed)
        scores = store["embeddings"] @ q_emb.T      # shape (N, 1)
        scores = scores.flatten()

        k = min(top_k, len(store["chunks"]))
        top_indices = np.argsort(scores)[::-1][:k]

        return [store["chunks"][i] for i in top_indices]

    def has_document(self, doc_id: str) -> bool:
        return doc_id in self._stores


# ──────────────────────────────────────────
#  Groq LLM Client  (free tier)
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

    def generate(self, system_prompt: str, user_message: str) -> str:
        try:
            response = self.client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_message},
                ],
                temperature=0.3,
                max_tokens=2048,
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"LLM Error: {str(e)}"


# ──────────────────────────────────────────
#  RAG Chain
# ──────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert AI assistant that answers questions based ONLY on the provided document excerpts.

Rules:
1. Answer using ONLY the information in the provided context.
2. If the answer is not in the context, say "I couldn't find this in the document."
3. Always cite the page numbers where you found the information.
4. Be precise, clear, and well-structured.
5. For MCQ generation, create 5 multiple-choice questions with 4 options each and mark the correct answer.
6. For summaries, be comprehensive but concise.
"""

def build_context_prompt(chunks: List[Chunk], query: str) -> str:
    context_parts = []
    for chunk in chunks:
        context_parts.append(f"[Page {chunk.page}]\n{chunk.text}")
    context = "\n\n---\n\n".join(context_parts)
    return f"""DOCUMENT EXCERPTS:
{context}

---

USER QUESTION: {query}

Please answer based on the document excerpts above. Always mention which page(s) you referenced."""


class RAGChain:
    """Orchestrates the full RAG pipeline for a single document."""

    def __init__(self, embedding_store: EmbeddingStore, llm: GeminiClient):
        self.embedding_store = embedding_store
        self.llm = llm

    def query(self, doc_id: str, question: str) -> Dict:
        # 1. Detect special intent and expand query
        retrieval_query = self._enhance_query(question)

        # 2. Retrieve relevant chunks
        chunks = self.embedding_store.retrieve(doc_id, retrieval_query)
        if not chunks:
            return {"answer": "No relevant content found in this document.", "sources": []}

        # 3. Build prompt and call LLM
        user_prompt = build_context_prompt(chunks, question)
        answer = self.llm.generate(SYSTEM_PROMPT, user_prompt)

        # 4. Extract source pages
        sources = sorted(set(c.page for c in chunks))

        return {
            "answer": answer,
            "sources": sources,
            "chunks_used": len(chunks),
        }

    @staticmethod
    def _enhance_query(question: str) -> str:
        """Expands special commands into richer retrieval queries."""
        q_lower = question.lower().strip()
        if q_lower in ("summarize", "summarize this", "summarize this document",
                        "give me a summary", "tldr"):
            return "main topics overview introduction conclusion key points summary"
        if "mcq" in q_lower or "multiple choice" in q_lower:
            return "key concepts facts definitions important points"
        m = re.search(r'chapter\s+(\d+)', q_lower)
        if m:
            return f"chapter {m.group(1)} content topics introduction"
        return question


# ──────────────────────────────────────────
#  Document Manager (single global state)
# ──────────────────────────────────────────

class DocumentManager:
    """Central store for all uploaded documents."""

    def __init__(self):
        self.embedding_store = EmbeddingStore()
        self.llm = GroqLLMClient()
        self.rag = RAGChain(self.embedding_store, self.llm)
        self._docs: Dict[str, DocumentMeta] = {}

    def ingest(self, pdf_path: str, filename: str) -> DocumentMeta:
        doc_id = str(uuid.uuid4())[:8]
        file_size_kb = round(os.path.getsize(pdf_path) / 1024, 1)

        # Extract text
        full_text, num_pages, page_texts = PDFProcessor.extract(pdf_path)

        # Chunk
        chunks = TextChunker.chunk_pages(page_texts, doc_id)

        # Embed & index
        self.embedding_store.add_document(doc_id, chunks)

        # Build snippet
        snippet = full_text[:200].replace("\n", " ").strip() + "…"

        meta = DocumentMeta(
            doc_id=doc_id,
            filename=filename,
            num_pages=num_pages,
            num_chunks=len(chunks),
            upload_time=time.time(),
            file_size_kb=file_size_kb,
            summary_snippet=snippet,
        )
        self._docs[doc_id] = meta
        return meta

    def remove(self, doc_id: str) -> bool:
        if doc_id not in self._docs:
            return False
        self.embedding_store.remove_document(doc_id)
        self._docs.pop(doc_id)
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
