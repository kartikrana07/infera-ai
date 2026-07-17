from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.auth_route import router as auth_router
from app.routes.cancel_route import router as cancel_router
from app.routes.chat_route import router as chat_router
from app.routes.image_route import router as image_router
from app.routes.rag_route import router as rag_router
from app.routes.voice_route import router as voice_router

app = FastAPI(
    title="Infera AI",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(cancel_router)
app.include_router(chat_router)
app.include_router(image_router)
app.include_router(rag_router)
app.include_router(voice_router)


@app.get("/")
async def root():
    return {"message": "Infera AI Running"}
