import random

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_user_by_email,
)
from app.core.deps import get_current_user
from app.core.email import send_reset_email
from app.core.config import settings
from app.models.user import User, PasswordReset
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    AuthResponse,
    UserResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing_user = await get_user_by_email(db, data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        phone=data.phone,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id)})

    return AuthResponse(
        access_token=access_token,
        user=UserResponse(id=user.id, email=user.email, phone=user.phone),
    )


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    access_token = create_access_token(data={"sub": str(user.id)})

    return AuthResponse(
        access_token=access_token,
        user=UserResponse(id=user.id, email=user.email, phone=user.phone),
    )


@router.post("/forgot-password", dependencies=[Depends(get_current_user)])
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email not found"
        )

    code = "".join([str(random.randint(0, 9)) for _ in range(6)])

    reset = PasswordReset(email=data.email, code=code)
    db.add(reset)
    await db.commit()

    email_sent = False
    email_error = ""
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        email_sent, email_error = send_reset_email(data.email, code)

    return {
        "message": f"Reset code sent to {data.email}",
        "email_sent": email_sent,
        "email_error": email_error,
    }


@router.post("/reset-password", dependencies=[Depends(get_current_user)])
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PasswordReset)
        .where(PasswordReset.email.isnot(None))
        .order_by(PasswordReset.id.desc())
        .limit(1)
    )
    reset = result.scalar_one_or_none()

    if not reset or reset.code != data.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired code"
        )

    user = await get_user_by_email(db, reset.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.password_hash = hash_password(data.new_password)
    await db.delete(reset)
    await db.commit()

    return {"message": "Password reset successful"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=current_user.id, email=current_user.email, phone=current_user.phone)
