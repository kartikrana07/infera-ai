import uuid
import chromadb
from google import genai

from app.core.config import settings

client = genai.Client(api_key=settings.GEMINI_API_KEY)

chroma_client = chromadb.PersistentClient(path="chroma_db")

collection = chroma_client.get_or_create_collection(
    name="pdf_documents"
)


def get_embedding(text: str):
    result = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text
    )

    return result.embeddings[0].values


def add_chunks_to_vector_db(
    chunks: list[str],
    file_name: str,
    session_id: str,
    upload_id: str
):
    ids = []
    embeddings = []
    documents = []
    metadatas = []

    for chunk in chunks:
        ids.append(str(uuid.uuid4()))
        embeddings.append(get_embedding(chunk))
        documents.append(chunk)
        metadatas.append({
            "source": file_name,
            "session_id": session_id,
            "upload_id": upload_id
        })

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas
    )

    return len(chunks)


def search_similar_chunks(query: str, upload_id: str | None = None, top_k: int = 5):
    query_embedding = get_embedding(query)

    query_options = {
        "query_embeddings": [query_embedding],
        "n_results": top_k
    }

    if upload_id:
        query_options["where"] = {"upload_id": upload_id}

    results = collection.query(
        **query_options
    )

    documents = results.get("documents", [[]])[0]

    return documents
