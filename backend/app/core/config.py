from dotenv import load_dotenv
import os

load_dotenv()


class Settings:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    TAVILY_API_KEY: str = os.getenv("TAVILY_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./chat_memory.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me-in-production-use-long-random-string")

    # Comma-separated emails that get no rate limits and max tokens
    PREMIUM_EMAILS: str = os.getenv("PREMIUM_EMAILS", "")

    def get_premium_emails(self) -> set:
        return {
            email.strip().lower()
            for email in self.PREMIUM_EMAILS.split(",")
            if email.strip()
        }

    def is_premium_user(self, email: str) -> bool:
        return email.strip().lower() in self.get_premium_emails()


settings = Settings()