from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.database.auth import User, get_current_user
from app.services.cancel_service import cancel_request

router = APIRouter()


class CancelRequest(BaseModel):
    request_id: str


@router.post("/cancel-generation")
async def cancel_generation(request: CancelRequest, user: User = Depends(get_current_user)):
    cancel_request(request.request_id)
    return {
        "cancelled": True,
        "request_id": request.request_id
    }
