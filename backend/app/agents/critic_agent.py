from app.core.prompts import CRITIC_SYSTEM_PROMPT
from app.services.gemini_service import GeminiService


class CriticAgent:

    @staticmethod
    def review(user_message: str, agent_response: str) -> str:
        prompt = f"""
{CRITIC_SYSTEM_PROMPT}

User Message:
{user_message}

Original Answer:
{agent_response}
"""
        return GeminiService.generate_response(prompt)