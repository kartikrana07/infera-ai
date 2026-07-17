from app.core.prompts import CODE_SYSTEM_PROMPT
from app.services.gemini_service import GeminiService


class CodeAgent:

    @staticmethod
    def handle(user_message: str, conversation_context: str = ""):

        final_prompt = f"""
{CODE_SYSTEM_PROMPT}

Previous Conversation in this chat:
{conversation_context or "No previous conversation in this chat."}

User Request:
{user_message}

Instruction:
Use this chat's previous messages to understand follow-up coding requests, file names, errors, and corrections.
"""

        response = GeminiService.generate_response(final_prompt)

        return response
