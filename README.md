# 📄 ChatPDF — AI Document Intelligence

<div align="center">

![ChatPDF Banner](https://img.shields.io/badge/ChatPDF-AI%20Document%20Intelligence-e2574c?style=for-the-badge&logo=files&logoColor=white)

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Groq](https://img.shields.io/badge/Groq-Llama%203.3%2070B-F55036?style=flat-square&logo=groq&logoColor=white)](https://console.groq.com)
[![D3.js](https://img.shields.io/badge/D3.js-v7-F9A03C?style=flat-square&logo=d3.js&logoColor=white)](https://d3js.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**Chat with your PDFs using RAG + Groq AI. Generate knowledge graphs, mind maps, timelines, and study materials — all from a single document or across 100 PDFs at once.**

[🚀 Quick Start](#-quick-start) · [✨ Features](#-features) · [🏗️ Architecture](#️-architecture) · [📸 Screenshots](#-screenshots)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Smart Chat** | Ask anything about your document — get cited answers with page references |
| 🌐 **Cross-Document Intelligence** | Query across 20–100 PDFs simultaneously — find common themes, compare methodologies |
| 🕸️ **Knowledge Graph** | Auto-extract entities & relationships, visualized as an interactive D3.js force graph |
| 🗺️ **Mind Map** | Collapsible horizontal tree map of document structure — click to expand/collapse |
| 📅 **Timeline** | Extract every date and event from the document in chronological order |
| 🎓 **Study Mode** | Generate Flashcards, MCQs, Fill-in-the-Blanks, and Viva Q&A from any document |
| 📒 **AI Notebook** | Auto-saves key concepts from every chat answer — searchable knowledge base |
| 📚 **Citation Verifier** | Every answer includes PDF name, page number, and highlighted source text |
| 🛠️ **Robust JSON Engine** | Uses `json-repair` to auto-fix and sanitize LLM outputs on the fly |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- A free [Groq API key](https://console.groq.com/keys)

### 1. Clone the repository
```bash
git clone https://github.com/komallbarhate/ChatPdf.git
cd ChatPdf
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Set up your API key
Create a `.env` file in the root directory:
```env
GROQ_API_KEY=your_groq_api_key_here
```
> 🔑 Get a **free** API key at [console.groq.com/keys](https://console.groq.com/keys)

### 4. Run the server
```bash
python app.py
```

### 5. Open in browser
```
http://localhost:8000
```

---

## 🏗️ Architecture

```
ChatPDF/
├── app.py                  # FastAPI backend — all API endpoints
├── rag_engine.py           # Core RAG engine
│   ├── PDFProcessor        # Text extraction from PDFs
│   ├── TextChunker         # Smart chunking with overlap
│   ├── EmbeddingStore      # Numpy vector store (no FAISS needed)
│   ├── GroqLLMClient       # LLM client with auto model fallback
│   ├── RAGChain            # Retrieval + generation pipeline
│   └── DocumentManager     # Central hub managing all documents
├── frontend/
│   ├── index.html          # Single-page app
│   ├── style.css           # iLovePDF-inspired white/red theme
│   ├── app.js              # Core app logic, chat, upload
│   ├── graph.js            # D3.js knowledge graph
│   ├── mindmap.js          # D3.js horizontal mind map
│   ├── studymode.js        # Flashcards, MCQs, fill blanks, viva
│   ├── timeline_viz.js     # Timeline renderer
│   └── notebook.js         # AI notebook (localStorage)
├── uploads/                # Uploaded PDFs stored here
└── requirements.txt
```

### RAG Pipeline
```
PDF Upload
    │
    ▼
PDFProcessor ──► page-level text extraction
    │
    ▼
TextChunker ──► 500-char chunks with 80-char overlap
    │
    ▼
EmbeddingStore ──► sentence-transformers/all-MiniLM-L6-v2
    │              numpy cosine similarity search
    ▼
RAGChain ──► top-6 chunks retrieved → Groq LLM → answer + citations
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload and index a PDF |
| `GET` | `/api/documents` | List all indexed documents |
| `DELETE` | `/api/documents/{id}` | Remove a document |
| `POST` | `/api/chat` | Chat with a single document |
| `POST` | `/api/chat-multi` | Cross-document chat |
| `POST` | `/api/knowledge-graph` | Generate knowledge graph JSON |
| `POST` | `/api/mind-map` | Generate mind map JSON |
| `POST` | `/api/timeline` | Extract all dates/events |
| `POST` | `/api/study-mode` | Generate study materials |
| `GET` | `/api/status` | Server health check |

---

## 🛠️ Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — high-performance Python web framework
- [Groq](https://groq.com/) — ultra-fast LLM inference (Llama 3.3 70B)
- [sentence-transformers](https://www.sbert.net/) — local text embeddings (`all-MiniLM-L6-v2`)
- [pypdf](https://pypdf.readthedocs.io/) — PDF text extraction
- [numpy](https://numpy.org/) — vector similarity search

**Frontend**
- Vanilla HTML + CSS + JavaScript (no framework)
- [D3.js v7](https://d3js.org/) — knowledge graph & mind map visualizations
- Google Fonts (Inter) — typography

---

## 📚 Supported Document Types

| Type | Examples |
|---|---|
| 📚 Research Papers | arXiv papers, journal articles, conference proceedings |
| 📓 College Notes | Lecture notes, study guides, textbook chapters |
| 📊 Company SOPs | Policies, manuals, standard operating procedures |
| 📕 Books | Chapters, summaries, any long-form text PDFs |

---

## 💡 Usage Tips

- **Study Mode**: Upload your textbook chapter → click Study → Generate → switch between Flashcards / MCQs / Fill Blanks / Viva
- **Cross-Document**: Upload 5+ research papers → click "Cross-Document Chat" → ask *"What are the common themes?"*
- **Knowledge Graph**: Works best on documents with named people, organizations, or technologies
- **Timeline**: Works best on historical documents, biographies, or research with dates
- **Rate Limits**: The free Groq tier gives 100K tokens/day on the primary model — the fallback chain covers you automatically

---

## 🔧 Configuration

Edit `rag_engine.py` to customize:

```python
CHUNK_SIZE      = 500    # characters per chunk
CHUNK_OVERLAP   = 80     # overlap between chunks
TOP_K           = 6      # chunks retrieved per query
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
MODEL_CHAIN     = ["llama-3.3-70b-versatile"]
```

---

## 📝 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

**Built with ❤️ using RAG + Groq AI**

⭐ Star this repo if you found it useful!

</div>
