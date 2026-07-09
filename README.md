# ChatPDF — AI Document Intelligence

> Chat with your PDFs. Generate knowledge graphs, mind maps, timelines and study materials — powered by BM25 retrieval + Groq AI (Llama 3.3).

🌐 **Live Demo**: [https://chatpdf-21ye.onrender.com](https://chatpdf-21ye.onrender.com)

---

## Features

| Feature | Description |
|---|---|
| 💬 **Smart Chat** | Ask anything about your document, get cited answers with page references |
| 🌐 **Cross-Document Chat** | Query across 20–100 PDFs simultaneously |
| 🕸️ **Knowledge Graph** | Auto-extract entities and relationships, visualized with D3.js |
| 🗺️ **Mind Map** | Interactive, collapsible hierarchical map of document structure |
| 🎓 **Study Mode** | Flashcards, MCQs, fill-in-the-blanks, and viva Q&A |
| 📅 **Timeline** | Auto-extract every event and date from the document |
| 📒 **Notebook** | Auto-saves answers from chat for later review |

---

## Tech Stack

- **Backend**: FastAPI + Python 3.11
- **Retrieval**: BM25 (pure Python, no model downloads — runs on 512MB RAM)
- **LLM**: Groq API — `llama-3.3-70b-versatile`
- **PDF Parsing**: pypdf
- **Frontend**: Vanilla HTML/CSS/JS + D3.js
- **Deployment**: Docker → Render

---

## Getting Started (Local)

### 1. Clone the repo
```bash
git clone https://github.com/komallbarhate/ChatPdf.git
cd ChatPdf
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env and add your GROQ_API_KEY
# Get a free key at: https://console.groq.com/keys
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run
```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Open [http://localhost:8000](http://localhost:8000)

---

## Deploy to Render

1. Fork this repo
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Set **Runtime** to **Docker**
5. Add environment variable: `GROQ_API_KEY` = your key
6. Click **Create Web Service**

Render auto-detects the `Dockerfile` and deploys. Your app will be live in ~3 minutes.

> **Note**: The free tier spins down after inactivity (first request after sleep takes ~30–50 seconds).

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `GROQ_API_KEY` | Your Groq API key ([get one free](https://console.groq.com/keys)) | ✅ Yes |

---

## Project Structure

```
ChatPdf/
├── app.py            # FastAPI routes
├── rag_engine.py     # BM25 retrieval + Groq LLM pipeline
├── requirements.txt  # Python dependencies
├── Dockerfile        # Docker build config
├── frontend/
│   ├── index.html    # Main UI
│   ├── style.css     # Styles
│   ├── app.js        # Core app logic
│   ├── graph.js      # Knowledge graph (D3)
│   ├── mindmap.js    # Mind map (D3)
│   ├── studymode.js  # Study materials UI
│   ├── timeline_viz.js # Timeline visualization
│   └── notebook.js   # Notebook tab
└── uploads/          # Uploaded PDFs (ephemeral on free tier)
```

---

## Use Cases

- 📚 **Research Papers** — Ask questions, extract timelines, map concepts
- 📓 **College Notes** — Generate flashcards, MCQs, and viva prep
- 📊 **Company SOPs** — Search across multiple policy documents at once
- 📕 **Books** — Build mind maps and knowledge graphs of entire books

---

## License

MIT
