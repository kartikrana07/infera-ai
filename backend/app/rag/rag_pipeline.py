from app.rag.pdf_loader import load_document_text
from app.rag.text_splitter import split_text
from app.rag.vector_store import add_chunks_to_vector_db, search_similar_chunks


def process_pdf(file_path: str, file_name: str, session_id: str, upload_id: str):
    text = load_document_text(file_path)

    if not text:
        return {
            "status": "failed",
            "message": "No readable text found in this document. Supported files: PDF, DOCX and TXT."
        }

    chunks = split_text(text)
    total_chunks = add_chunks_to_vector_db(
        chunks=chunks,
        file_name=file_name,
        session_id=session_id,
        upload_id=upload_id
    )

    return {
        "status": "success",
        "file_name": file_name,
        "upload_id": upload_id,
        "chunks_stored": total_chunks
    }


def retrieve_context(question: str, upload_id: str | None = None):
    chunks = search_similar_chunks(question, upload_id=upload_id)

    context = "\n\n".join(chunks)

    return context
