"""
FastAPI backend for Chat With PDFs application.
Serves the frontend and exposes REST endpoints for PDF upload and chat.
"""

import shutil
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag_engine import DocumentManager, UPLOAD_DIR

# ──────────────────────────────────────────
#  App Setup
# ──────────────────────────────────────────

app = FastAPI(title="Chat With PDFs", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
frontend_dir = Path(__file__).parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

# Initialise the document manager once (loads embedding model)
print("\n[*] Initialising RAG engine...")
try:
    manager = DocumentManager()
    print("[OK] RAG engine ready!\n")
    LLM_READY = True
except ValueError as e:
    print(f"\n[!] {e}\n")
    manager = None
    LLM_READY = False


# ──────────────────────────────────────────
#  Request / Response Models
# ──────────────────────────────────────────

class ChatRequest(BaseModel):
    doc_id: str
    question: str

class ChatResponse(BaseModel):
    answer: str
    sources: list[int]
    chunks_used: int


# ──────────────────────────────────────────
#  Routes
# ──────────────────────────────────────────

@app.get("/")
async def index():
    return FileResponse(str(frontend_dir / "index.html"))


@app.get("/api/status")
async def status():
    return {
        "llm_ready": LLM_READY,
        "message": "API key missing — add GEMINI_API_KEY to .env" if not LLM_READY else "Ready",
    }


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not LLM_READY:
        raise HTTPException(status_code=503,
                            detail="LLM not configured. Add GEMINI_API_KEY to .env file.")

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Save to uploads/
    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
    temp_path = UPLOAD_DIR / f"tmp_{safe_name}"

    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Ingest into RAG pipeline
        meta = manager.ingest(str(temp_path), file.filename)

        # Rename to doc_id prefixed file
        final_path = UPLOAD_DIR / f"{meta.doc_id}_{safe_name}"
        temp_path.rename(final_path)

        return JSONResponse({
            "success": True,
            "doc_id": meta.doc_id,
            "filename": meta.filename,
            "num_pages": meta.num_pages,
            "num_chunks": meta.num_chunks,
            "file_size_kb": meta.file_size_kb,
            "summary_snippet": meta.summary_snippet,
            "message": f"Indexed {meta.num_chunks} chunks from {meta.num_pages} pages",
        })

    except Exception as e:
        if temp_path.exists():
            temp_path.unlink()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    result = manager.chat(req.doc_id, req.question)

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return ChatResponse(
        answer=result["answer"],
        sources=result.get("sources", []),
        chunks_used=result.get("chunks_used", 0),
    )


@app.get("/api/documents")
async def list_documents():
    if not LLM_READY:
        return {"documents": [], "llm_ready": False}
    return {"documents": manager.list_docs(), "llm_ready": True}


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    if not manager:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    success = manager.remove(doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"success": True, "message": "Document removed."}


# ──────────────────────────────────────────
#  Entry Point
# ──────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print("=" * 55)
    print("  ChatPDF -- RAG Application")
    print("  Open: http://localhost:8000")
    print("=" * 55)
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
