from app.core.prompts import CHAT_SYSTEM_PROMPT
from app.services.gemini_service import GeminiService


class ChatAgent:

    @staticmethod
    def handle(user_message: str, conversation_context: str = "") -> str:
        prompt = f"""
{CHAT_SYSTEM_PROMPT}

Previous Conversation in this chat:
{conversation_context or "No previous conversation in this chat."}

User Message:
{user_message}

Instruction:
Use the previous conversation only for this same chat session. Remember names, preferences, earlier questions, and follow-up context from this chat.
"""
        return GeminiService.generate_response(prompt)
