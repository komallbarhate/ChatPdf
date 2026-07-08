"""
FastAPI backend — Enhanced with all advanced features.
"""

import shutil
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag_engine import DocumentManager, UPLOAD_DIR

app = FastAPI(title="ChatPDF Advanced", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

frontend_dir = Path(__file__).parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

print("\n[*] Initialising RAG engine...")
try:
    manager = DocumentManager()
    print("[OK] RAG engine ready!\n")
    LLM_READY = True
except ValueError as e:
    print(f"\n[!] {e}\n")
    manager = None
    LLM_READY = False


# ── Models ──────────────────────────────────

class ChatRequest(BaseModel):
    doc_id: str
    question: str

class MultiChatRequest(BaseModel):
    question: str
    doc_ids: Optional[List[str]] = None

class FeatureRequest(BaseModel):
    doc_id: str   # can be "all" for multi-doc


# ── Routes ──────────────────────────────────

@app.get("/")
async def index():
    return FileResponse(str(frontend_dir / "index.html"))

@app.get("/api/status")
async def status():
    return {"llm_ready": LLM_READY,
            "message": "API key missing" if not LLM_READY else "Ready"}

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._- ")
    temp_path = UPLOAD_DIR / f"tmp_{safe_name}"
    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        meta = manager.ingest(str(temp_path), file.filename)
        final_path = UPLOAD_DIR / f"{meta.doc_id}_{safe_name}"
        temp_path.rename(final_path)
        return JSONResponse({
            "success": True, "doc_id": meta.doc_id, "filename": meta.filename,
            "num_pages": meta.num_pages, "num_chunks": meta.num_chunks,
            "file_size_kb": meta.file_size_kb, "summary_snippet": meta.summary_snippet,
            "message": f"Indexed {meta.num_chunks} chunks from {meta.num_pages} pages",
        })
    except Exception as e:
        if temp_path.exists():
            temp_path.unlink()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    result = manager.chat(req.doc_id, req.question)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result

@app.post("/api/chat-multi")
async def chat_multi(req: MultiChatRequest):
    """Cross-document chat — search across all or selected docs."""
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    return manager.chat_multi(req.question, req.doc_ids)

@app.post("/api/knowledge-graph")
async def knowledge_graph(req: FeatureRequest):
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    result = manager.get_knowledge_graph(req.doc_id)
    return result

@app.post("/api/mind-map")
async def mind_map(req: FeatureRequest):
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    return manager.get_mind_map(req.doc_id)

@app.post("/api/timeline")
async def timeline(req: FeatureRequest):
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    return manager.get_timeline(req.doc_id)

@app.post("/api/study-mode")
async def study_mode(req: FeatureRequest):
    if not LLM_READY:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    return manager.get_study_materials(req.doc_id)

@app.get("/api/documents")
async def list_documents():
    if not LLM_READY:
        return {"documents": [], "llm_ready": False}
    return {"documents": manager.list_docs(), "llm_ready": True}

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    if not manager:
        raise HTTPException(status_code=503, detail="LLM not configured.")
    if not manager.remove(doc_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return {"success": True}


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    print("=" * 55)
    print("  ChatPDF Advanced -- All Features Active")
    print(f"  Open: http://localhost:{port}")
    print("=" * 55)
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
