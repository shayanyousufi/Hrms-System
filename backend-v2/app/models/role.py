from datetime import datetime
from typing import Optional

from sqlalchemy import Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user_roles: Mapped[list["UserRole"]] = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False, index=True)
    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="user_roles_link", viewonly=True)
    role: Mapped["Role"] = relationship("Role", back_populates="user_roles")


from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User
