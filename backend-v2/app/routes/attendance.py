import math
from datetime import date as date_type, timedelta, datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Body

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.config import UserRole
from app.models.employee import Attendance, Employee, ActivityLog
from app.models.user import User
from app.schemas.employee import (
    PaginatedAttendanceRecords,
    AttendanceStats,
    TodayAttendanceItem,
    ActivityFeedItem,
)

router = APIRouter(
    prefix="/api/attendance",
    tags=["attendance"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/stats", response_model=AttendanceStats)
async def attendance_stats(
    date: str = Query("", description="YYYY-MM-DD, defaults to today"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    target_date = _parse_date(date)

    # Manager view is scoped to their direct reports only.
    manager_ids = await _team_scope_ids(db, current_user)
    scoped = manager_ids is not None

    total_query = select(func.count(Employee.id)).where(Employee.employment_status == "Active")
    rows_query = (
        select(Attendance.status, func.count(Attendance.id))
        .where(Attendance.date == target_date)
        .group_by(Attendance.status)
    )

    if scoped:
        team = list(manager_ids or ())
        total_query = total_query.where(Employee.id.in_(team))
        rows_query = rows_query.where(Attendance.employee_id.in_(team))

    emp_result = await db.execute(total_query)
    total_employees = emp_result.scalar() or 0

    rows = await db.execute(rows_query)
    counts = {status: count for status, count in rows.all()}

    present = counts.get("Present", 0)
    absent = counts.get("Absent", 0)
    leave = counts.get("Leave", 0)
    late = counts.get("Late", 0)

    attendance_rate = round(present / total_employees * 100, 1) if total_employees else 0

    return AttendanceStats(
        present=present,
        absent=absent,
        leave=leave,
        late=late,
        total=total_employees,
        attendance_rate=attendance_rate,
    )


async def _team_scope_ids(db: AsyncSession, current_user: User):
    """Return a tuple of employee ids in a MANAGER's direct-report team, else None.

    - SUPER_ADMIN / HR -> None (no scoping).
    - MANAGER -> tuple of direct-report employee ids (may be empty).
    - EMPLOYEE triggers None (these endpoints are staff-only).
    """
    if current_user.role != UserRole.MANAGER.value:
        return None
    my_employee = (await db.execute(
        select(Employee).where(Employee.user_id == current_user.id)
    )).scalar_one_or_none()
    if my_employee is None:
        return ()
    team = (await db.execute(
        select(Employee.id).where(Employee.manager_id == my_employee.id)
    )).scalars().all()
    return tuple(team)


@router.get("/records", response_model=PaginatedAttendanceRecords)
async def all_attendance_records(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query("", description="Search by employee name or ID"),
    department: str = Query("", description="Filter by department"),
    status_filter: str = Query("", alias="status", description="Filter by attendance status"),
    date: str = Query("", description="YYYY-MM-DD, defaults to today"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    target_date = _parse_date(date)

    filters = [Attendance.date == target_date]
    if status_filter:
        filters.append(Attendance.status == status_filter)

    # Manager sees only direct reports.
    manager_ids = await _team_scope_ids(db, current_user)
    if manager_ids is not None:
        filters.append(Attendance.employee_id.in_(manager_ids or ()))

    query = (
        select(Attendance, Employee)
        .join(Employee, Employee.id == Attendance.employee_id)
        .where(*filters)
    )
    count_query = (
        select(func.count(Attendance.id))
        .join(Employee, Employee.id == Attendance.employee_id)
        .where(*filters)
    )

    if search:
        like = f"%{search}%"
        search_filter = or_(
            Employee.first_name.ilike(like),
            Employee.last_name.ilike(like),
            Employee.employee_id.ilike(like),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if department:
        query = query.where(Employee.department == department)
        count_query = count_query.where(Employee.department == department)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        query.order_by(desc(Attendance.check_in), Employee.first_name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)

    records = []
    for att, emp in result.all():
        records.append(_to_record(att, emp))

    return PaginatedAttendanceRecords(
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        records=records,
    )


@router.get("/today", response_model=list[TodayAttendanceItem])
async def today_attendance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    """All employees with their status for today (including those not checked in)."""
    today = dt.now().date()

    manager_ids = await _team_scope_ids(db, current_user)

    emp_query = select(Employee).where(
        Employee.employment_status.in_(["Active", "On Leave"])
    )
    if manager_ids is not None:
        emp_query = emp_query.where(Employee.id.in_(manager_ids or ()))

    emp_result = await db.execute(emp_query)
    employees = emp_result.scalars().all()

    result = await db.execute(
        select(Attendance).where(Attendance.date == today)
    )
    attend_map = {a.employee_id: a for a in result.scalars().all()}

    items = []
    for emp in employees:
        att = attend_map.get(emp.id)
        if emp.employment_status == "On Leave":
            status = "On Leave"
        elif att:
            status = att.status or "Present"
        else:
            status = "Absent"

        items.append(
            TodayAttendanceItem(
                employee_id=emp.employee_id,
                first_name=emp.first_name,
                last_name=emp.last_name,
                department=emp.department,
                designation=emp.designation,
                profile_picture=emp.profile_picture,
                check_in=att.check_in if att else None,
                check_out=att.check_out if att else None,
                status=status,
            )
        )

    items.sort(key=lambda x: (0 if x.status == "Present" else 1 if x.status == "On Leave" else 2))
    return items


@router.get("/my-status")
async def my_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Current user's own employee + today's check-in/out status (creates one if needed)."""
    emp_result = await db.execute(
        select(Employee).where(Employee.user_id == current_user.id)
    )
    emp = emp_result.scalar_one_or_none()
    if not emp:
        emp_result = await db.execute(
            select(Employee).where(Employee.email == current_user.email)
        )
        emp = emp_result.scalar_one_or_none()

    # If the logged-in user has no employee record yet, create a personal one so
    # they always have their own attendance to clock in/out against.
    if not emp:
        name = current_user.email.split("@")[0].replace(".", " ").strip()
        first = name.title() or "User"
        last = "Account"
        prefix = "EMP-U"
        try:
            num_result = await db.execute(
                select(Employee.id).order_by(Employee.id.desc()).limit(1)
            )
            last_id = num_result.scalar()
            num = (last_id or 0) + 1
        except Exception:
            num = 1
        emp = Employee(
            employee_id=f"{prefix}{num}",
            first_name=first,
            last_name=last,
            email=current_user.email,
            department="General",
            designation="Member",
            joining_date=dt.now().date(),
            employment_status="Active",
        )
        db.add(emp)
        await db.commit()
        await db.refresh(emp)

    today = dt.now().date()
    result = await db.execute(
        select(Attendance).where(
            Attendance.employee_id == emp.id, Attendance.date == today
        )
    )
    att = result.scalar_one_or_none()

    return {
        "linked": True,
        "id": emp.id,
        "employee_id": emp.employee_id,
        "full_name": f"{emp.first_name} {emp.last_name}",
        "checked_in": bool(att and att.check_in),
        "checked_out": bool(att and att.check_out),
        "check_in": att.check_in if att else None,
        "check_out": att.check_out if att else None,
    }


@router.post("/checkin")
async def check_in(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee_id: str = payload.get("employee_id") or ""
    emp_result = await db.execute(
        select(Employee).where(Employee.employee_id == employee_id)
    )
    emp = emp_result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _require_self_or_team(db, emp, current_user)

    today = dt.now().date()
    result = await db.execute(
        select(Attendance).where(
            Attendance.employee_id == emp.id, Attendance.date == today
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Already checked in today")

    now = dt.now()
    check_in_time = now.strftime("%H:%M")
    status = "Late" if _is_late(now) else "Present"
    attendance = Attendance(
        employee_id=emp.id, date=today, check_in=check_in_time, status=status
    )
    db.add(attendance)

    log = ActivityLog(
        employee_id=emp.id,
        action=f"Checked in at {check_in_time}",
        performed_by=emp.first_name,
    )
    db.add(log)
    await db.commit()
    return {
        "message": f"Checked in at {check_in_time}",
        "check_in": check_in_time,
        "status": status,
    }


@router.post("/checkout")
async def check_out(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee_id: str = payload.get("employee_id") or ""
    emp_result = await db.execute(
        select(Employee).where(Employee.employee_id == employee_id)
    )
    emp = emp_result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _require_self_or_team(db, emp, current_user)

    today = dt.now().date()
    result = await db.execute(
        select(Attendance).where(
            Attendance.employee_id == emp.id, Attendance.date == today
        )
    )
    attendance = result.scalar_one_or_none()
    if not attendance or not attendance.check_in:
        raise HTTPException(status_code=400, detail="No check-in found for today")
    if attendance.check_out:
        raise HTTPException(status_code=400, detail="Already checked out today")

    now = dt.now()
    check_out_time = now.strftime("%H:%M")
    attendance.check_out = check_out_time

    log = ActivityLog(
        employee_id=emp.id,
        action=f"Checked out at {check_out_time}",
        performed_by=emp.first_name,
    )
    db.add(log)
    await db.commit()
    return {"message": f"Checked out at {check_out_time}", "check_out": check_out_time}


async def _require_self_or_team(db: AsyncSession, emp: Employee, current_user: User) -> None:
    """Clock in/out only allowed on the user's own profile, their team, or all (HR/admin)."""
    if current_user.role == UserRole.EMPLOYEE.value:
        if not (emp.user_id is not None and emp.user_id == current_user.id):
            raise HTTPException(status_code=403, detail="You can only clock in/out for yourself")
    elif current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not my_employee or not (emp.manager_id is not None and emp.manager_id == my_employee.id):
            raise HTTPException(status_code=403, detail="You can only clock in/out your direct reports")


def _is_late(now: dt) -> bool:
    """Office starts at 09:00 — check-in after 09:00 counts as Late."""
    return now.hour > 9 or (now.hour == 9 and now.minute > 0)


@router.get("/activity-feed", response_model=list[ActivityFeedItem])
async def activity_feed(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    query = (
        select(ActivityLog, Employee)
        .join(Employee, Employee.id == ActivityLog.employee_id)
        .order_by(desc(ActivityLog.id))
        .limit(limit)
    )

    manager_ids = await _team_scope_ids(db, current_user)
    if manager_ids is not None:
        query = query.where(ActivityLog.employee_id.in_(manager_ids or ()))

    result = await db.execute(query)
    items = []
    for log, emp in result.all():
        items.append(
            ActivityFeedItem(
                id=log.id,
                action=log.action,
                performed_by=log.performed_by,
                timestamp=log.timestamp,
                employee_id=emp.employee_id,
                department=emp.department,
            )
        )
    return items


def _parse_date(value: str) -> date_type:
    if not value:
        return dt.now().date()
    try:
        return date_type.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")


def _to_record(att: Attendance, emp: Employee):
    from app.schemas.employee import AttendanceRecordWithEmployee
    return AttendanceRecordWithEmployee(
        id=att.id,
        date=att.date,
        check_in=att.check_in,
        check_out=att.check_out,
        status=att.status,
        employee_id=emp.employee_id,
        first_name=emp.first_name,
        last_name=emp.last_name,
        employee_department=emp.department,
        designation=emp.designation,
        profile_picture=emp.profile_picture,
    )
