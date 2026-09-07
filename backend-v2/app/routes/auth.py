import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

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


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if user:
        # Invalidate any previous unused reset requests for this account
        # so only the newest token can be redeemed.
        await db.execute(
            update(PasswordReset)
            .where(PasswordReset.email == user.email, PasswordReset.used.is_(False))
            .values(used=True)
        )

        token = secrets.token_urlsafe(48)
        reset = PasswordReset(
            email=user.email,
            token_hash=_hash_token(token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
            used=False,
        )
        db.add(reset)
        await db.commit()

        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            send_reset_email(user.email, token)
        elif settings.ENVIRONMENT != "production":
            # Development-only convenience so the flow can be tested without SMTP.
            print(f"[DEV ONLY] Password reset token for {user.email}: {token}")

    # Uniform response — do not reveal whether the account exists.
    return {"message": "If an account exists for this email, a password reset code has been sent."}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, data.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    token_hash = _hash_token(data.token)
    result = await db.execute(
        select(PasswordReset).where(
            PasswordReset.email == data.email,
            PasswordReset.token_hash == token_hash,
            PasswordReset.used.is_(False),
        )
    )
    reset = result.scalar_one_or_none()
    if not reset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    now = datetime.now(timezone.utc)
    if reset.expires_at is None or reset.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token has expired"
        )

    user.password_hash = hash_password(data.new_password)
    reset.used = True
    # Any other pending reset requests for this account are consumed as well.
    await db.execute(
        update(PasswordReset)
        .where(PasswordReset.email == data.email, PasswordReset.used.is_(False))
        .values(used=True)
    )
    await db.commit()

    return {"message": "Password reset successful"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(id=current_user.id, email=current_user.email, phone=current_user.phone)
