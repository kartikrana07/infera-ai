import os
import shutil
import uuid
import json

from fastapi import APIRouter, Depends, UploadFile, File, Form
from pydantic import BaseModel

from app.rag.rag_pipeline import process_pdf
from app.agents.rag_agent import RagAgent
from app.database.auth import User, get_current_user
from app.database.chat_memory import save_message, get_conversation_context
from app.services.cancel_service import clear_cancelled, is_cancelled

router = APIRouter()

UPLOAD_DIR = "data/uploads"
PDF_STATE_FILE = "data/pdf_sessions.json"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs("data", exist_ok=True)


class RagQuestion(BaseModel):
    question: str
    session_id: str | None = None
    request_id: str | None = None


def load_pdf_state():
    if not os.path.exists(PDF_STATE_FILE):
        return {}

    with open(PDF_STATE_FILE, "r", encoding="utf-8") as file:
        return json.load(file)


def save_pdf_state(state: dict):
    with open(PDF_STATE_FILE, "w", encoding="utf-8") as file:
        json.dump(state, file, indent=2)


def set_active_pdf(session_id: str, file_name: str, upload_id: str):
    state = load_pdf_state()
    state[session_id] = {
        "file_name": file_name,
        "upload_id": upload_id
    }
    save_pdf_state(state)


def get_active_pdf(session_id: str):
    return load_pdf_state().get(session_id)


def document_label(file_name: str | None):
    lower_name = (file_name or "").lower()

    if lower_name.endswith(".pdf"):
        return "PDF"

    if lower_name.endswith(".docx"):
        return "Word document"

    if lower_name.endswith(".txt"):
        return "Text file"

    return "Document"


@router.post("/upload-pdf")
async def upload_pdf(
    file: UploadFile = File(...),
    session_id: str | None = Form(None),
    user: User = Depends(get_current_user)
):
    active_session_id = session_id or str(uuid.uuid4())
    upload_id = str(uuid.uuid4())
    label = document_label(file.filename)
    save_message(active_session_id, "user", f"Uploaded {label}: {file.filename}", user_id=user.id)

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    result = process_pdf(
        file_path=file_path,
        file_name=file.filename,
        session_id=active_session_id,
        upload_id=upload_id
    )
    if result.get("status") == "success":
        set_active_pdf(active_session_id, file.filename, upload_id)
        save_message(
            active_session_id,
            "assistant",
            f"Active document set: {result.get('file_name')}\nChunks stored: {result.get('chunks_stored', 0)}\nAsk document questions will now answer only from this file.",
            user_id=user.id
        )
    else:
        save_message(
            active_session_id,
            "assistant",
            f"{label} upload failed: {result.get('message', 'Could not process this document.')}",
            user_id=user.id
        )

    result["session_id"] = active_session_id
    return result


@router.post("/upload-pdf-and-ask")
async def upload_pdf_and_ask(
    file: UploadFile = File(...),
    question: str = Form(...),
    session_id: str | None = Form(None),
    request_id: str | None = Form(None),
    user: User = Depends(get_current_user)
):
    active_session_id = session_id or str(uuid.uuid4())
    upload_id = str(uuid.uuid4())
    label = document_label(file.filename)
    save_message(active_session_id, "user", f"Uploaded {label}: {file.filename}", user_id=user.id)
    save_message(active_session_id, "user", f"Document question: {question}", user_id=user.id)

    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    result = process_pdf(
        file_path=file_path,
        file_name=file.filename,
        session_id=active_session_id,
        upload_id=upload_id
    )

    if result.get("status") != "success":
        answer = f"{label} upload failed: {result.get('message', 'Could not process this document.')}"
        save_message(active_session_id, "assistant", answer, user_id=user.id)
        result["session_id"] = active_session_id
        result["answer"] = answer
        return result

    set_active_pdf(active_session_id, file.filename, upload_id)
    conversation_context = get_conversation_context(active_session_id, user_id=user.id)
    answer = RagAgent.answer(
        question=question,
        upload_id=upload_id,
        conversation_context=conversation_context
    )

    if is_cancelled(request_id):
        clear_cancelled(request_id)
        return {
            "session_id": active_session_id,
            "file_name": file.filename,
            "chunks_stored": result.get("chunks_stored", 0),
            "answer": "Generation stopped.",
            "cancelled": True
        }

    save_message(
        active_session_id,
        "assistant",
        f"Active document set: {file.filename}\nChunks stored: {result.get('chunks_stored', 0)}",
        user_id=user.id
    )
    save_message(active_session_id, "assistant", answer, user_id=user.id)
    clear_cancelled(request_id)

    return {
        "status": "success",
        "session_id": active_session_id,
        "file_name": file.filename,
        "chunks_stored": result.get("chunks_stored", 0),
        "answer": answer
    }


@router.post("/ask-pdf")
async def ask_pdf(request: RagQuestion, user: User = Depends(get_current_user)):
    session_id = request.session_id or str(uuid.uuid4())
    active_pdf = get_active_pdf(session_id)
    conversation_context = get_conversation_context(session_id, user_id=user.id)
    save_message(session_id, "user", f"Document question: {request.question}", user_id=user.id)

    if not active_pdf:
        answer = "No active document is linked to this chat. Please upload a PDF, DOCX or TXT file in this chat first."
    else:
        answer = RagAgent.answer(
            question=request.question,
            upload_id=active_pdf["upload_id"],
            conversation_context=conversation_context
        )

    if is_cancelled(request.request_id):
        clear_cancelled(request.request_id)
        return {
            "session_id": session_id,
            "active_pdf": active_pdf,
            "question": request.question,
            "answer": "Generation stopped.",
            "cancelled": True
        }

    save_message(session_id, "assistant", answer, user_id=user.id)
    clear_cancelled(request.request_id)

    return {
        "session_id": session_id,
        "active_pdf": active_pdf,
        "question": request.question,
        "answer": answer
    }
