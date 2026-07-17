from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.auth import (
    AuthRequest,
    User,
    create_token,
    get_current_user,
    hash_password,
    public_user,
    verify_password,
)
from app.database.db import get_db
from app.utils.logger import logger

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(request: AuthRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    password = request.password.strip()
    name = (request.name or email.split("@")[0]).strip()

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(name=name, email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user)
    logger.info("New user registered: %s", email)
    return {"token": token, "user": public_user(user)}


@router.post("/login")
async def login(request: AuthRequest, db: Session = Depends(get_db)):
    email = request.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_token(user)
    logger.info("User logged in: %s", email)
    return {"token": token, "user": public_user(user)}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {"user": public_user(user)}

