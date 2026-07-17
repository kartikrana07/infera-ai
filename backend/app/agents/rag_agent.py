from app.rag.rag_pipeline import retrieve_context
from app.services.gemini_service import GeminiService


class RagAgent:

    @staticmethod
    def answer(
        question: str,
        upload_id: str | None = None,
        conversation_context: str = ""
    ):
        context = retrieve_context(question, upload_id=upload_id)

        if not context:
            return "No relevant document context found for the active PDF. Please upload a PDF first, then ask your question again."

        prompt = f"""
You are a RAG-based document assistant.

Answer the user's question using ONLY the given context.
If answer is not present in context, say:
"I could not find this information in the uploaded document."

Context:
{context}

Previous Conversation in this chat:
{conversation_context or "No previous conversation in this chat."}

Question:
{question}

Instruction:
Use the previous conversation only to understand follow-up wording. The factual answer must still come from the active PDF context.
"""

        return GeminiService.generate_response(prompt)
