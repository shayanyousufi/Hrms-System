from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    action: str
    target_user_id: Optional[int] = None
    target_email: Optional[str] = None
    performed_by: Optional[int] = None
    performer_email: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[str] = None
