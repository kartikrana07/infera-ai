import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.schemas.chat_schema import ChatRequest
from app.graphs.assistant_graph import run_assistant_graph
from app.database.chat_memory import save_message, get_conversation_context
from app.database.auth import User, get_current_user
from app.services.cancel_service import clear_cancelled, is_cancelled
from app.services.gemini_service import client

router = APIRouter()


@router.post("/voice-chat")
async def voice_chat(request: ChatRequest, user: User = Depends(get_current_user)):
    session_id = request.session_id or str(uuid.uuid4())
    conversation_context = get_conversation_context(session_id, user_id=user.id)

    save_message(session_id, "user", request.message, user_id=user.id)

    result = run_assistant_graph(
        user_message=request.message,
        conversation_context=conversation_context
    )

    if is_cancelled(request.request_id):
        clear_cancelled(request.request_id)
        return {
            "session_id": session_id,
            "agent": "cancelled",
            "response": "Generation stopped.",
            "cancelled": True
        }

    save_message(session_id, "assistant", result["final_response"], user_id=user.id)
    clear_cancelled(request.request_id)

    return {
        "session_id": session_id,
        "agent": result["route"],
        "response": result["final_response"]
    }


@router.post("/speech-to-text")
async def speech_to_text(
    audio: UploadFile = File(...),
    user: User = Depends(get_current_user)
):
    audio_bytes = await audio.read()

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio received")

    try:
        transcription = client.audio.transcriptions.create(
            file=(
                audio.filename or "voice.webm",
                audio_bytes,
                audio.content_type or "audio/webm"
            ),
            model="whisper-large-v3-turbo",
            response_format="json",
            language="en"
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Speech transcription failed: {str(error)}"
        ) from error

    text = getattr(transcription, "text", "") or ""
    return {"text": text.strip()}
