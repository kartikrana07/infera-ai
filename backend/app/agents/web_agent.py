from app.services.tavily_service import TavilyService
from app.services.gemini_service import GeminiService


class WebAgent:

    @staticmethod
    def handle(user_message: str, conversation_context: str = ""):
        def is_job_query(message: str) -> bool:
            job_words = [
                "job", "jobs", "hiring", "vacancy", "career", "careers",
                "apply", "opening", "openings", "developer", "internship"
            ]
            lowered = message.lower()
            return any(word in lowered for word in job_words)

        def clean_results(items: list[dict]) -> list[dict]:
            cleaned = []
            seen_urls = set()

            for item in items:
                url = (item.get("url") or "").strip()
                title = (item.get("title") or "Source").strip()
                content = (item.get("content") or "").strip()

                if not url.startswith(("http://", "https://")):
                    continue

                if url in seen_urls:
                    continue

                seen_urls.add(url)
                cleaned.append({
                    "title": title,
                    "content": content,
                    "url": url
                })

            return cleaned

        query = user_message
        job_query = is_job_query(user_message)

        if job_query:
            query = f"{user_message} official job openings apply links"

        web_results = TavilyService.search(query)

        results = clean_results(web_results.get("results", []))

        context = ""

        for item in results:
            context += f"""
Title: {item.get('title')}

Content:
{item.get('content')}

Source:
{item.get('url')}

-------------------
"""

        wants_sources = any(word in user_message.lower() for word in [
            "source",
            "sources",
            "link",
            "links",
            "reference",
            "references",
            "apply"
        ]) or job_query

        prompt = f"""
You are a job and web research AI assistant.

Answer the user using the provided web search results.

Rules:
- Give concise and useful answers
- Use the search context
- Do NOT hallucinate
- Do NOT invent company names, job posts, URLs, or markdown links
- If the query is about jobs, summarize roles/platforms/skills only from search context
- Do not write any apply/source links inside the main answer
- The backend will add verified source URLs separately

User Question:
{user_message}

Previous Conversation in this chat:
{conversation_context or "No previous conversation in this chat."}

Search Results:
{context}
"""

        answer = GeminiService.generate_response(prompt)

        if wants_sources:

            sources = "\n\nApply / source links from search results:\n"

            if not results:
                sources += "- No live source links were returned by search. Try a more specific role and location.\n"
            else:
                for item in results:
                    sources += f"- {item.get('title')}: {item.get('url')}\n"

            answer += sources

        return answer
