
from groq import Groq
from app.core.config import settings
from app.utils.logger import logger

client = Groq(api_key=settings.GROQ_API_KEY)

NORMAL_MAX_TOKENS = 1200
PREMIUM_MAX_TOKENS = 4096


class GeminiService:

    @staticmethod
    def generate_response(prompt: str, premium: bool = False) -> str:
        max_tokens = PREMIUM_MAX_TOKENS if premium else NORMAL_MAX_TOKENS
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an advanced AI assistant.\n"
                            "Rules:\n"
                            "- Give detailed and professional answers\n"
                            "- Explain concepts clearly\n"
                            "- For coding questions: provide proper code and explain it\n"
                            "- For web search: summarize results nicely and provide sources if requested\n"
                            "- Format answers beautifully using markdown"
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content

        except Exception as exc:
            logger.error("Groq generate_response error: %s", exc)
            return f"Error generating response. Please try again."

    @staticmethod
    def stream_response(prompt: str, system_prompt: str = "", premium: bool = False):
        """Yields text chunks for SSE streaming."""
        max_tokens = PREMIUM_MAX_TOKENS if premium else NORMAL_MAX_TOKENS
        try:
            stream = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt or "You are a helpful AI assistant."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=max_tokens,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

        except Exception as exc:
            logger.error("Groq stream_response error: %s", exc)
            yield "Error generating response. Please try again."

    @staticmethod
    def analyze_image(prompt: str, image_data_url: str, premium: bool = False) -> str:
        max_tokens = PREMIUM_MAX_TOKENS if premium else NORMAL_MAX_TOKENS
        try:
            response = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert coding and debugging assistant.\n"
                            "When the user sends an error screenshot or UI image:\n"
                            "- Read the visible error carefully\n"
                            "- Identify the likely cause\n"
                            "- Give clear fix steps\n"
                            "- Provide corrected code when useful\n"
                            "- If text is unclear, say what you can infer and ask for the missing detail"
                        )
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": image_data_url}},
                        ],
                    }
                ],
                temperature=0.3,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content

        except Exception as exc:
            logger.error("Groq analyze_image error: %s", exc)
            return f"Image analysis error: {exc}"
