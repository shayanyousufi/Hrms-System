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
from app.core.deps import get_current_user, require_roles
from app.core.email import send_reset_email
from app.core.config import settings, UserRole
from app.models.user import User, PasswordReset
from app.models.employee import Employee
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    AuthResponse,
    UserResponse,
    UpdateRoleRequest,
    LinkUserRequest,
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
        role=UserRole.EMPLOYEE.value,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id)})

    return AuthResponse(
        access_token=access_token,
        user=UserResponse(id=user.id, email=user.email, phone=user.phone, role=user.role),
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
        user=UserResponse(id=user.id, email=user.email, phone=user.phone, role=user.role),
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
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        phone=current_user.phone,
        role=current_user.role,
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.id))
    return [
        UserResponse(id=u.id, email=u.email, phone=u.phone, role=u.role)
        for u in result.scalars().all()
    ]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_role(
    user_id: int,
    data: UpdateRoleRequest,
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR)),
    db: AsyncSession = Depends(get_db),
):
    """Change a user's role.

    - SUPER_ADMIN may assign any role (including HR / SUPER_ADMIN).
    - HR may only assign EMPLOYEE or MANAGER (cannot self-escalate or mint admins).
    """
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    requested = data.role.value if isinstance(data.role, UserRole) else str(data.role)

    if current_user.role == UserRole.HR.value and requested in {
        UserRole.HR.value,
        UserRole.SUPER_ADMIN.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="HR can only assign EMPLOYEE or MANAGER roles",
        )

    target.role = requested
    await db.commit()
    await db.refresh(target)
    return UserResponse(id=target.id, email=target.email, phone=target.phone, role=target.role)


@router.post("/users/{user_id}/link-employee", response_model=UserResponse)
async def link_employee(
    user_id: int,
    data: LinkUserRequest,
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR)),
    db: AsyncSession = Depends(get_db),
):
    """Link an existing user account to an existing employee record.

    Resolves the disconnected users<->employees data by HR/Super Admin action,
    so EMPLOYEE self-service and MANAGER team scoping work for those accounts.
    """
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    employee = await db.get(Employee, data.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if employee.user_id is not None and employee.user_id != target.id:
        raise HTTPException(
            status_code=400,
            detail="Employee is already linked to a different user account",
        )

    employee.user_id = target.id
    await db.commit()
    await db.refresh(target)
    return UserResponse(id=target.id, email=target.email, phone=target.phone, role=target.role)
