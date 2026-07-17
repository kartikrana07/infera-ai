import uuid
from fastapi import APIRouter, Depends

from app.schemas.chat_schema import ChatRequest
from app.graphs.assistant_graph import run_assistant_graph
from app.database.chat_memory import (
    save_message,
    get_messages,
    get_all_sessions,
    get_conversation_context,
    delete_session,
)
from app.database.auth import User, get_current_user
from app.services.cancel_service import clear_cancelled, is_cancelled

router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest, user: User = Depends(get_current_user)):
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


@router.get("/chats")
async def get_chats(user: User = Depends(get_current_user)):
    return {
        "sessions": get_all_sessions(user_id=user.id)
    }


@router.get("/chats/{session_id}")
async def get_chat_history(session_id: str, user: User = Depends(get_current_user)):
    return {
        "session_id": session_id,
        "messages": get_messages(session_id, user_id=user.id)
    }


@router.delete("/chats/{session_id}")
async def delete_chat(session_id: str, user: User = Depends(get_current_user)):
    deleted_count = delete_session(session_id, user_id=user.id)
    return {
        "session_id": session_id,
        "deleted": deleted_count > 0,
        "deleted_messages": deleted_count
    }
