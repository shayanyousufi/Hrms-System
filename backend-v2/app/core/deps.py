from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_token
from app.core.config import UserRole
from app.models.user import User
from app.models.employee import Employee


security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_roles(*roles: UserRole):
    """Dependency factory that enforces role-based access.

    Returns HTTP 403 when the authenticated user's role is not in the allowed
    set. Call as `Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR))`.
    """

    allowed = set(roles)

    async def _checker(current_user: User = Depends(get_current_user)) -> User:
        if UserRole(current_user.role) not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return _checker


async def get_current_employee(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Employee:
    """Return the Employee linked to the current user (via employees.user_id)."""
    if current_user.role == UserRole.SUPER_ADMIN.value:
        # Super admins are not necessarily linked to an employee record.
        raise HTTPException(status_code=403, detail="Super admin has no employee profile")

    result = await db.execute(select(Employee).where(Employee.user_id == current_user.id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No employee profile linked to this account. Ask an HR admin to link one.",
        )
    return employee
