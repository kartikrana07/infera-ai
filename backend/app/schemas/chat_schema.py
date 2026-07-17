from pydantic import BaseModel, field_validator


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    request_id: str | None = None

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty.")
        if len(v) > 10_000:
            raise ValueError("Message too long — maximum 10,000 characters.")
        return v


class ChatResponse(BaseModel):
    agent: str
    response: str
