from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional

from app.core.config import UserRole


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str


class UserResponse(BaseModel):
    id: int
    email: str
    phone: Optional[str] = None
    roles: list[str] = [UserRole.EMPLOYEE.value]
    employee_id: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateRoleRequest(BaseModel):
    role: UserRole

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: UserRole) -> UserRole:
        return v


class UpdateRolesRequest(BaseModel):
    """Replace all roles for a user with the given set."""
    roles: list[UserRole]

    @field_validator("roles")
    @classmethod
    def validate_roles(cls, v: list[UserRole]) -> list[UserRole]:
        if not v:
            raise ValueError("At least one role is required")
        return v


class LinkUserRequest(BaseModel):
    """Pair a user account with an employee record (admin action)."""
    employee_id: int


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
