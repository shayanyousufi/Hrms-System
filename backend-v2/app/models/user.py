from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    employee = relationship("Employee", uselist=False, back_populates="user")
    user_roles_link: Mapped[list["UserRole"]] = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")

    @property
    def role_names(self) -> list[str]:
        """Return list of role name strings (e.g. ['HR', 'MANAGER'])."""
        return [ur.role.name for ur in self.user_roles_link if ur.role is not None]

    def has_role(self, role_name: str) -> bool:
        return role_name in self.role_names

    def has_any_role(self, *role_names: str) -> bool:
        return any(r in self.role_names for r in role_names)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
