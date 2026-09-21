"""Audit log routes — SUPER_ADMIN only."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import UserRole
from app.core.database import get_db
from app.core.deps import require_roles
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogOut

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    action: str = Query("", description="Filter by action type"),
    actor_id: int = Query(0, description="Filter by performer user ID"),
    target_id: int = Query(0, description="Filter by target user ID"),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if actor_id:
        query = query.where(AuditLog.performed_by == actor_id)
        count_query = count_query.where(AuditLog.performed_by == actor_id)
    if target_id:
        query = query.where(AuditLog.target_user_id == target_id)
        count_query = count_query.where(AuditLog.target_user_id == target_id)

    total = (await db.execute(count_query)).scalar()

    query = query.order_by(AuditLog.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    rows = (await db.execute(query)).scalars().all()

    # Eagerly resolve emails
    user_ids = set()
    for r in rows:
        if r.target_user_id:
            user_ids.add(r.target_user_id)
        if r.performed_by:
            user_ids.add(r.performed_by)

    user_map: dict[int, str] = {}
    if user_ids:
        users = (await db.execute(
            select(User).where(User.id.in_(user_ids))
        )).scalars().all()
        user_map = {u.id: u.email for u in users}

    return [
        AuditLogOut(
            id=r.id,
            action=r.action,
            target_user_id=r.target_user_id,
            target_email=user_map.get(r.target_user_id) if r.target_user_id else None,
            performed_by=r.performed_by,
            performer_email=user_map.get(r.performed_by) if r.performed_by else None,
            old_value=r.old_value,
            new_value=r.new_value,
            ip_address=r.ip_address,
            created_at=r.created_at.isoformat() if r.created_at else None,
        )
        for r in rows
    ]


@router.get("/actions")
async def list_action_types(
    _current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditLog.action, func.count(AuditLog.id))
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
    )
    return [{"action": row[0], "count": row[1]} for row in result.all()]
