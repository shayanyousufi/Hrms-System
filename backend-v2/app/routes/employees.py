import math
import random
import string
import csv
import io
import uuid
from datetime import timedelta, datetime as dt, date as date_type
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, asc, text
import base64

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles, get_current_employee
from app.core.config import UserRole
from app.core.storage import (
    save_document, resolve_stored_path, delete_document,
)
from app.models.employee import (
    Employee, Attendance, LeaveRecord, EmployeeDocument, ActivityLog, Task, Meeting
)
from app.models.user import User
from app.schemas.employee import (
    EmployeeCreate, EmployeeUpdate, EmployeeResponse, EmployeeListResponse,
    PaginatedEmployees, AttendanceResponse, LeaveResponse, LeaveResponseWithEmployee,
    DocumentResponse, ActivityLogResponse, TaskResponse, MeetingResponse,
    PaginatedAttendance, PaginatedLeaves, PaginatedActivities,
    PaginatedTasks, PaginatedMeetings, LeaveCreate, LeaveUpdate,
)

router = APIRouter(prefix="/api/employees", tags=["employees"], dependencies=[Depends(get_current_user)])


def _manage_roles_only(current_user) -> bool:
    """True when the user manages employees (HR/Super Admin), not self-scoped."""
    return current_user.role in (UserRole.SUPER_ADMIN.value, UserRole.HR.value)


def _is_self_or_staff(employee: Employee, current_user) -> bool:
    """True when the current EMPLOYEE is viewing their own record."""
    return (
        current_user.role == UserRole.EMPLOYEE.value
        and employee.user_id is not None
        and employee.user_id == current_user.id
    )


def _is_team_member(employee: Employee, manager_id: int) -> bool:
    """True when the employee reports to the given manager."""
    return employee.manager_id is not None and employee.manager_id == manager_id


async def _ensure_employee_access(db: AsyncSession, employee: Employee, current_user: User) -> None:
    """Raise 403 unless the current user may read this employee's records.

    - HR / Super Admin: allowed.
    - MANAGER: allowed only for their direct reports.
    - EMPLOYEE: allowed only for their own linked profile.
    """
    if _manage_roles_only(current_user):
        return
    if current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not my_employee or not _is_team_member(employee, my_employee.id):
            raise HTTPException(status_code=403, detail="You can only access your direct reports' records")
        return
    if not _is_self_or_staff(employee, current_user):
        raise HTTPException(status_code=403, detail="You can only access your own records")


async def _require_approve_rights(db: AsyncSession, employee: Employee, current_user: User) -> None:
    """Leave approve/reject rights: HR, Super Admin, or the direct manager."""
    if current_user.role in (UserRole.SUPER_ADMIN.value, UserRole.HR.value):
        return
    if current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not my_employee or not _is_team_member(employee, my_employee.id):
            raise HTTPException(status_code=403, detail="You can only approve your direct reports' leave")
        return
    raise HTTPException(status_code=403, detail="You do not have permission to approve leave")


def generate_employee_id():
    rand = "".join(random.choices(string.digits, k=4))
    return f"EMP-{rand}"


@router.get("", response_model=PaginatedEmployees)
async def list_employees(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    search: str = Query("", description="Search by name, email, employee_id"),
    department: str = Query("", description="Filter by department"),
    status_filter: str = Query("", alias="status", description="Filter by status"),
    sort_by: str = Query("id", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    date_from: str = Query("", description="Filter from date (YYYY-MM-DD)"),
    date_to: str = Query("", description="Filter to date (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    query = select(Employee)
    count_query = select(func.count(Employee.id))

    # Managers only see their direct reports — never all employees.
    if current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if my_employee is None:
            return _empty_employee_list(page, per_page)
        query = query.where(Employee.manager_id == my_employee.id)
        count_query = count_query.where(Employee.manager_id == my_employee.id)

    if search:
        search_filter = or_(
            Employee.first_name.ilike(f"%{search}%"),
            Employee.last_name.ilike(f"%{search}%"),
            Employee.email.ilike(f"%{search}%"),
            Employee.employee_id.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    if department:
        query = query.where(Employee.department == department)
        count_query = count_query.where(Employee.department == department)

    if status_filter:
        query = query.where(Employee.employment_status == status_filter)
        count_query = count_query.where(Employee.employment_status == status_filter)

    if date_from:
        from datetime import date as date_type
        try:
            df = date_type.fromisoformat(date_from)
            query = query.where(Employee.joining_date >= df)
            count_query = count_query.where(Employee.joining_date >= df)
        except ValueError:
            pass

    if date_to:
        from datetime import date as date_type
        try:
            dt_val = date_type.fromisoformat(date_to)
            query = query.where(Employee.joining_date <= dt_val)
            count_query = count_query.where(Employee.joining_date <= dt_val)
        except ValueError:
            pass

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    sort_column = getattr(Employee, sort_by, Employee.id)
    if sort_order == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    employees = result.scalars().all()

    return PaginatedEmployees(
        total=total,
        page=page,
        per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        employees=[EmployeeListResponse.model_validate(e) for e in employees],
    )


def _empty_employee_list(page: int, per_page: int) -> PaginatedEmployees:
    return PaginatedEmployees(
        total=0, page=page, per_page=per_page, total_pages=0, employees=[]
    )


@router.get("/departments")
async def list_departments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Employee.department).distinct())
    return [row[0] for row in result.all()]


@router.get("/stats/overview")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    from datetime import date as date_type

    # Manager sees team-scoped overview only.
    manager_ids = None
    if current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if my_employee is not None:
            team = (await db.execute(
                select(Employee.id).where(Employee.manager_id == my_employee.id)
            )).scalars().all()
            manager_ids = list(team)
        else:
            manager_ids = []

    total_query = select(func.count(Employee.id))
    if manager_ids is not None:
        total_query = total_query.where(Employee.id.in_(manager_ids))

    total_result = await db.execute(total_query)
    total = total_result.scalar() or 0

    status_query = select(Employee.employment_status, func.count(Employee.id))
    if manager_ids is not None:
        status_query = status_query.where(Employee.id.in_(manager_ids))
    status_result = await db.execute(status_query.group_by(Employee.employment_status))
    status_counts = {row[0]: row[1] for row in status_result.all()}

    dept_query = select(Employee.department, func.count(Employee.id))
    if manager_ids is not None:
        dept_query = dept_query.where(Employee.id.in_(manager_ids))
    dept_result = await db.execute(dept_query.group_by(Employee.department))
    departments = [{"name": row[0], "count": row[1]} for row in dept_result.all()]

    today = date_type.today()
    att_query = (
        select(Attendance.status, func.count(Attendance.id))
        .where(Attendance.date == today)
    )
    if manager_ids is not None:
        att_query = att_query.where(Attendance.employee_id.in_(select(Employee.id).where(
            Employee.id.in_(manager_ids) if manager_ids else False
        )))
    att_result = await db.execute(att_query.group_by(Attendance.status))
    attendance_today = {row[0]: row[1] for row in att_result.all()}
    if not attendance_today:
        att_query2 = (
            select(Attendance.status, func.count(Attendance.id))
            .where(Attendance.date == today - timedelta(days=1))
        )
        if manager_ids is not None:
            att_query2 = att_query2.where(Attendance.employee_id.in_(select(Employee.id).where(
                Employee.id.in_(manager_ids) if manager_ids else False
            )))
        att_result2 = await db.execute(att_query2.group_by(Attendance.status))
        attendance_today = {row[0]: row[1] for row in att_result2.all()}

    leave_query = select(func.count(LeaveRecord.id)).where(LeaveRecord.status == "Pending")
    if manager_ids is not None:
        leave_query = leave_query.where(LeaveRecord.employee_id.in_(manager_ids))
    pending_leaves = (await db.execute(leave_query)).scalar() or 0

    return {
        "total_employees": total,
        "active": status_counts.get("Active", 0),
        "on_leave": status_counts.get("On Leave", 0),
        "inactive": status_counts.get("Inactive", 0),
        "pending_leaves": pending_leaves,
        "departments": departments,
        "attendance_today": {
            "present": attendance_today.get("Present", 0),
            "absent": attendance_today.get("Absent", 0),
            "leave": attendance_today.get("Leave", 0),
            "late": attendance_today.get("Late", 0),
        },
    }


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Permission by role
    if _manage_roles_only(current_user):
        # HR / Super Admin: full access
        pass
    elif current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not my_employee or not _is_team_member(employee, my_employee.id):
            raise HTTPException(status_code=403, detail="You can only view your direct reports")
    else:
        # EMPLOYEE: only their own record
        if not _is_self_or_staff(employee, current_user):
            raise HTTPException(status_code=403, detail="You can only view your own profile")

    return EmployeeResponse.model_validate(employee)


@router.post("", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR)),
):
    existing_email = await db.execute(select(Employee).where(Employee.email == data.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already exists")

    emp_id = generate_employee_id()
    while True:
        existing = await db.execute(select(Employee).where(Employee.employee_id == emp_id))
        if not existing.scalar_one_or_none():
            break
        emp_id = generate_employee_id()

    employee = Employee(employee_id=emp_id, **data.model_dump())
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    log = ActivityLog(employee_id=employee.id, action="Employee created", performed_by="System")
    db.add(log)
    await db.commit()

    return EmployeeResponse.model_validate(employee)


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: str,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR)),
):
    result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if data.email and data.email != employee.email:
        existing_email = await db.execute(select(Employee).where(Employee.email == data.email))
        if existing_email.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Email already exists")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(employee, key, value)

    await db.commit()
    await db.refresh(employee)

    log = ActivityLog(employee_id=employee.id, action="Employee profile updated", performed_by="System")
    db.add(log)
    await db.commit()

    return EmployeeResponse.model_validate(employee)


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: str,
    hard: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR)),
):
    # Hard delete is SUPER_ADMIN only.
    if hard and current_user.role != UserRole.SUPER_ADMIN.value:
        raise HTTPException(
            status_code=403,
            detail="Only Super Admin can permanently delete employees",
        )

    result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if hard:
        await db.execute(text(f"DELETE FROM activity_logs WHERE employee_id = {employee.id}"))
        await db.execute(text(f"DELETE FROM employee_documents WHERE employee_id = {employee.id}"))
        await db.execute(text(f"DELETE FROM leave_records WHERE employee_id = {employee.id}"))
        await db.execute(text(f"DELETE FROM attendance WHERE employee_id = {employee.id}"))
        await db.delete(employee)
        await db.commit()
        return {"message": "Employee permanently deleted"}
    else:
        employee.employment_status = "Inactive"
        log = ActivityLog(employee_id=employee.id, action="Employee deactivated (soft delete)", performed_by="System")
        db.add(log)
        await db.commit()
        return {"message": "Employee marked as inactive"}


@router.get("/{employee_id}/attendance", response_model=PaginatedAttendance)
async def get_attendance(
    employee_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_employee_access(db, employee, current_user)

    count_query = select(func.count(Attendance.id)).where(Attendance.employee_id == employee.id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(Attendance)
        .where(Attendance.employee_id == employee.id)
        .order_by(desc(Attendance.date))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    records = [AttendanceResponse.model_validate(a) for a in result.scalars().all()]

    return PaginatedAttendance(
        total=total, page=page, per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        records=records,
    )


@router.post("/attendance/checkin")
async def check_in(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    # EMPLOYEE can only check themselves in; managers/HR/admin can check-in team/all.
    if current_user.role == UserRole.EMPLOYEE.value:
        if not _is_self_or_staff(employee, current_user):
            raise HTTPException(status_code=403, detail="You can only check yourself in")
    elif current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not my_employee or not _is_team_member(employee, my_employee.id):
            raise HTTPException(status_code=403, detail="You can only check in your direct reports")

    today = dt.now().date()
    result = await db.execute(
        select(Attendance).where(Attendance.employee_id == employee_id, Attendance.date == today)
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Already checked in today")

    now = dt.now()
    check_in_time = now.strftime("%H:%M")
    status = "Late" if now.hour > 9 or (now.hour == 9 and now.minute > 0) else "Present"
    attendance = Attendance(employee_id=employee_id, date=today, check_in=check_in_time, status=status)
    db.add(attendance)

    emp = await db.get(Employee, employee_id)
    if emp:
        log = ActivityLog(employee_id=emp.id, action=f"Checked in at {check_in_time}", performed_by=emp.first_name)
        db.add(log)

    await db.commit()
    return {"message": f"Checked in at {check_in_time}", "check_in": check_in_time}


@router.post("/attendance/checkout")
async def check_out(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role == UserRole.EMPLOYEE.value:
        if not _is_self_or_staff(employee, current_user):
            raise HTTPException(status_code=403, detail="You can only check yourself out")
    elif current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not my_employee or not _is_team_member(employee, my_employee.id):
            raise HTTPException(status_code=403, detail="You can only check out your direct reports")

    today = dt.now().date()
    result = await db.execute(
        select(Attendance).where(Attendance.employee_id == employee_id, Attendance.date == today)
    )
    attendance = result.scalar_one_or_none()
    if not attendance:
        raise HTTPException(status_code=400, detail="No check-in found for today")
    if attendance.check_out:
        raise HTTPException(status_code=400, detail="Already checked out today")

    now = dt.now()
    check_out_time = now.strftime("%H:%M")
    attendance.check_out = check_out_time

    emp = await db.get(Employee, employee_id)
    if emp:
        log = ActivityLog(employee_id=emp.id, action=f"Checked out at {check_out_time}", performed_by=emp.first_name)
        db.add(log)

    await db.commit()
    return {"message": f"Checked out at {check_out_time}", "check_out": check_out_time}


@router.get("/attendance/today/{employee_id}")
async def get_today_attendance(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if current_user.role == UserRole.EMPLOYEE.value:
        if not _is_self_or_staff(employee, current_user):
            raise HTTPException(status_code=403, detail="You can only view your own status")
    elif current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not my_employee or not _is_team_member(employee, my_employee.id):
            raise HTTPException(status_code=403, detail="You can only view your direct reports' status")

    today = dt.now().date()
    result = await db.execute(
        select(Attendance).where(Attendance.employee_id == employee_id, Attendance.date == today)
    )
    attendance = result.scalar_one_or_none()
    if not attendance:
        return {"checked_in": False, "check_in": None, "check_out": None}
    return {
        "checked_in": True,
        "check_in": attendance.check_in,
        "check_out": attendance.check_out,
    }


@router.put("/{employee_id}/profile-picture")
async def upload_profile_picture(
    employee_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_employee_access(db, employee, current_user)

    content = await file.read()
    base64_image = base64.b64encode(content).decode("utf-8")
    employee.profile_picture = f"data:{file.content_type};base64,{base64_image}"

    log = ActivityLog(employee_id=employee.id, action="Profile picture updated", performed_by=employee.first_name)
    db.add(log)
    await db.commit()

    return {"message": "Profile picture uploaded successfully"}


@router.get("/{employee_id}/leaves", response_model=PaginatedLeaves)
async def get_leaves(
    employee_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_employee_access(db, employee, current_user)

    count_query = select(func.count(LeaveRecord.id)).where(LeaveRecord.employee_id == employee.id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(LeaveRecord)
        .where(LeaveRecord.employee_id == employee.id)
        .order_by(desc(LeaveRecord.start_date))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    records = [LeaveResponse.model_validate(l) for l in result.scalars().all()]

    return PaginatedLeaves(
        total=total, page=page, per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        records=records,
    )


def _document_response(doc: EmployeeDocument, uploader: User | None = None) -> DocumentResponse:
    return DocumentResponse(
        id=doc.id,
        employee_id=doc.employee_id,
        name=doc.name,
        doc_type=doc.doc_type,
        has_file=bool(doc.stored_filename),
        content_type=doc.content_type,
        file_size=doc.file_size,
        uploaded_at=doc.uploaded_at,
        uploaded_by=doc.uploaded_by,
        uploaded_by_name=uploader.email if uploader else None,
    )


async def _get_document_with_access(
    db: AsyncSession, employee_id: str, document_id: int, current_user: User
) -> tuple[Employee, EmployeeDocument]:
    """Resolve the employee + document, enforcing RBAC + ownership."""
    emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_employee_access(db, employee, current_user)

    doc_result = await db.execute(
        select(EmployeeDocument).where(
            EmployeeDocument.id == document_id,
            EmployeeDocument.employee_id == employee.id,
        )
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return employee, doc


@router.get("/{employee_id}/documents", response_model=list[DocumentResponse])
async def get_documents(
    employee_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_employee_access(db, employee, current_user)

    result = await db.execute(
        select(EmployeeDocument)
        .where(EmployeeDocument.employee_id == employee.id)
        .order_by(desc(EmployeeDocument.id))
    )
    docs = result.scalars().all()

    uploader_ids = {d.uploaded_by for d in docs if d.uploaded_by}
    uploaders = {}
    if uploader_ids:
        user_rows = await db.execute(select(User).where(User.id.in_(uploader_ids)))
        uploaders = {u.id: u for u in user_rows.scalars().all()}

    return [_document_response(d, uploaders.get(d.uploaded_by)) for d in docs]


@router.post("/{employee_id}/documents", response_model=DocumentResponse, status_code=201)
async def upload_document(
    employee_id: str,
    file: UploadFile = File(...),
    doc_type: str = Query("General", description="Free-form document category"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_employee_access(db, employee, current_user)

    original_name = (file.filename or "document").strip()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    stored = save_document(employee.id, original_name, content)

    from pathlib import Path as _P
    safe_name = _P(original_name).name[:200] or "document"

    doc = EmployeeDocument(
        employee_id=employee.id,
        name=safe_name,
        doc_type=(doc_type or "General").strip()[:50] or "General",
        stored_filename=stored,
        content_type=file.content_type,
        file_size=len(content),
        uploaded_by=current_user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    log = ActivityLog(
        employee_id=employee.id,
        action=f"Document uploaded: {safe_name}",
        performed_by=current_user.email,
    )
    db.add(log)
    await db.commit()

    return _document_response(doc, current_user)


@router.get("/{employee_id}/documents/{document_id}/download")
async def download_document(
    employee_id: str,
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _, doc = await _get_document_with_access(db, employee_id, document_id, current_user)

    if not doc.stored_filename:
        raise HTTPException(status_code=404, detail="No file attached to this document")

    path = resolve_stored_path(doc.stored_filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    content_type = doc.content_type or "application/octet-stream"
    filename = doc.name or f"document-{doc.id}"
    disposition = f'attachment; filename="{_ascii_fallback(filename)}"'

    return StreamingResponse(
        _iter_file(path),
        media_type=content_type,
        headers={"Content-Disposition": disposition},
    )


def _iter_file(path):
    with open(path, "rb") as f:
        while chunk := f.read(64 * 1024):
            yield chunk


def _ascii_fallback(name: str) -> str:
    """Content-Disposition ASCII placeholder for non-latin characters."""
    encoded = name.encode("ascii", "ignore").decode()
    return encoded or "document"


@router.delete("/{employee_id}/documents/{document_id}", status_code=200)
async def delete_document_endpoint(
    employee_id: str,
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employee, doc = await _get_document_with_access(db, employee_id, document_id, current_user)

    delete_document(doc.stored_filename)
    await db.delete(doc)

    log = ActivityLog(
        employee_id=employee.id,
        action=f"Document deleted: {doc.name}",
        performed_by=current_user.email,
    )
    db.add(log)
    await db.commit()

    return {"message": "Document deleted"}


@router.get("/{employee_id}/activities", response_model=PaginatedActivities)
async def get_activities(
    employee_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_result = await db.execute(select(Employee).where(Employee.employee_id == employee_id))
    employee = emp_result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    await _ensure_employee_access(db, employee, current_user)

    count_query = select(func.count(ActivityLog.id)).where(ActivityLog.employee_id == employee.id)
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(ActivityLog)
        .where(ActivityLog.employee_id == employee.id)
        .order_by(desc(ActivityLog.timestamp))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    records = [ActivityLogResponse.model_validate(a) for a in result.scalars().all()]

    return PaginatedActivities(
        total=total, page=page, per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        records=records,
    )


@router.get("/dashboard/tasks", response_model=PaginatedTasks)
async def get_tasks(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_query = select(func.count(Task.id))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(Task)
        .order_by(desc(Task.id))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    records = [TaskResponse.model_validate(t) for t in result.scalars().all()]

    return PaginatedTasks(
        total=total, page=page, per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        records=records,
    )


@router.get("/dashboard/meetings", response_model=PaginatedMeetings)
async def get_meetings(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_query = select(func.count(Meeting.id))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = (
        select(Meeting)
        .order_by(desc(Meeting.id))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    records = [MeetingResponse.model_validate(m) for m in result.scalars().all()]

    return PaginatedMeetings(
        total=total, page=page, per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        records=records,
    )


@router.post("/leaves", response_model=LeaveResponse, status_code=201)
async def create_leave(
    data: LeaveCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # EMPLOYEE may only submit leave for their own linked profile.
    if current_user.role == UserRole.EMPLOYEE.value:
        own = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if not own or own.id != data.employee_id:
            raise HTTPException(status_code=403, detail="You can only submit leave for yourself")

    leave = LeaveRecord(
        employee_id=data.employee_id,
        leave_type=data.leave_type,
        start_date=data.start_date,
        end_date=data.end_date,
        reason=data.reason,
        status="Pending",
    )
    db.add(leave)
    await db.commit()
    await db.refresh(leave)

    emp = await db.get(Employee, data.employee_id)
    if emp:
        log = ActivityLog(employee_id=emp.id, action=f"Leave request submitted: {data.leave_type}", performed_by=emp.first_name)
        db.add(log)
        await db.commit()

    return LeaveResponse.model_validate(leave)


@router.put("/leaves/{leave_id}", response_model=LeaveResponse)
async def update_leave(
    leave_id: int,
    data: LeaveUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(LeaveRecord).where(LeaveRecord.id == leave_id))
    leave = result.scalar_one_or_none()
    if not leave:
        raise HTTPException(status_code=404, detail="Leave record not found")

    employee = await db.get(Employee, leave.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    # Approve/reject is a staff action: HR, Super Admin, or the direct manager.
    await _require_approve_rights(db, employee, current_user)

    # Revert previously approved leave's deduction before applying a new state.
    if leave.status == "Approved":
        emp = await db.get(Employee, leave.employee_id)
        if emp and emp.leave_balance is not None:
            emp.leave_balance = (emp.leave_balance or 0) + _leave_days(leave)

    leave.status = data.status
    await db.commit()
    await db.refresh(leave)

    # Deduct balance when a leave is approved (deduct once).
    if data.status == "Approved":
        emp = await db.get(Employee, leave.employee_id)
        if emp:
            days = _leave_days(leave)
            emp.leave_balance = (emp.leave_balance or 0) - days
            await db.commit()

    emp = await db.get(Employee, leave.employee_id)
    if emp:
        log = ActivityLog(employee_id=emp.id, action=f"Leave {data.status.lower()} for {leave.leave_type}", performed_by="System")
        db.add(log)
        await db.commit()

    return LeaveResponse.model_validate(leave)


@router.get("/leaves/all", response_model=PaginatedLeaves)
async def get_all_leaves(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    status_filter: str = Query("", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    query = select(LeaveRecord)
    count_query = select(func.count(LeaveRecord.id))

    # Manager sees only their direct reports' leave.
    if current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if my_employee is None:
            return PaginatedLeaves(total=0, page=page, per_page=per_page, total_pages=0, records=[])
        team_ids = (await db.execute(
            select(Employee.id).where(Employee.manager_id == my_employee.id)
        )).scalars().all()
        query = query.where(LeaveRecord.employee_id.in_(team_ids))
        count_query = count_query.where(LeaveRecord.employee_id.in_(team_ids))

    if status_filter:
        query = query.where(LeaveRecord.status == status_filter)
        count_query = count_query.where(LeaveRecord.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(desc(LeaveRecord.id)).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    leaves = result.scalars().all()

    records = []
    for l in leaves:
        emp = await db.get(Employee, l.employee_id)
        records.append(
            LeaveResponseWithEmployee(
                id=l.id, employee_id=l.employee_id, leave_type=l.leave_type,
                start_date=l.start_date, end_date=l.end_date,
                status=l.status, reason=l.reason,
                first_name=emp.first_name if emp else None,
                last_name=emp.last_name if emp else None,
                employee_code=emp.employee_id if emp else None,
                leave_balance=emp.leave_balance if emp else None,
            )
        )

    return PaginatedLeaves(
        total=total, page=page, per_page=per_page,
        total_pages=math.ceil(total / per_page) if total > 0 else 0,
        records=records,
    )


def _leave_days(leave: LeaveRecord) -> int:
    """Number of calendar days a leave spans (minimum 1)."""
    days = (leave.end_date - leave.start_date).days + 1
    return max(1, days)


def _parse_csv_dates(date_from: str, date_to: str) -> tuple:
    try:
        df = date_type.fromisoformat(date_from) if date_from else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date_from, use YYYY-MM-DD")
    try:
        dt_val = date_type.fromisoformat(date_to) if date_to else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date_to, use YYYY-MM-DD")
    if df and dt_val and df > dt_val:
        raise HTTPException(status_code=400, detail="date_from cannot be after date_to")
    return df, dt_val


@router.get("/export/employees.csv")
async def export_employees_csv(
    department: str = Query(""),
    status_filter: str = Query("", alias="status"),
    date_from: str = Query("", description="Joining date from (YYYY-MM-DD)"),
    date_to: str = Query("", description="Joining date to (YYYY-MM-DD)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR)),
):
    df, dt_val = _parse_csv_dates(date_from, date_to)

    query = select(Employee)
    if department:
        query = query.where(Employee.department == department)
    if status_filter:
        query = query.where(Employee.employment_status == status_filter)
    if df:
        query = query.where(Employee.joining_date >= df)
    if dt_val:
        query = query.where(Employee.joining_date <= dt_val)

    result = await db.execute(query.order_by(Employee.id))
    employees = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Employee ID", "First Name", "Last Name", "Email", "Phone",
        "Department", "Designation", "Status", "Joining Date",
        "Salary", "Leave Balance",
    ])
    for e in employees:
        writer.writerow([
            e.employee_id, e.first_name, e.last_name, e.email, e.phone or "",
            e.department, e.designation, e.employment_status,
            e.joining_date.isoformat() if e.joining_date else "",
            e.salary if e.salary is not None else "",
            e.leave_balance if e.leave_balance is not None else "",
        ])

    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=employees.csv"},
    )


@router.get("/export/attendance.csv")
async def export_attendance_csv(
    date_from: str = Query("", description="YYYY-MM-DD"),
    date_to: str = Query("", description="YYYY-MM-DD"),
    status_filter: str = Query("", alias="status"),
    employee: str = Query("", description="employee_id filter"),
    department: str = Query(""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    df, dt_val = _parse_csv_dates(date_from, date_to)

    query = select(Attendance, Employee).join(Employee, Attendance.employee_id == Employee.id)

    # Manager exports only their team's attendance.
    if current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if my_employee is None:
            query = query.where(False)
        else:
            team_ids = (await db.execute(
                select(Employee.id).where(Employee.manager_id == my_employee.id)
            )).scalars().all()
            query = query.where(Attendance.employee_id.in_(team_ids))

    if df:
        query = query.where(Attendance.date >= df)
    if dt_val:
        query = query.where(Attendance.date <= dt_val)
    if status_filter:
        query = query.where(Attendance.status == status_filter)
    if employee:
        emp = (await db.execute(
            select(Employee).where(Employee.employee_id == employee)
        )).scalar_one_or_none()
        if emp is None:
            return Response(content="\ufeffEmployee ID not found", media_type="text/csv; charset=utf-8",
                            headers={"Content-Disposition": "attachment; filename=attendance.csv"})
        query = query.where(Attendance.employee_id == emp.id)
    if department:
        query = query.where(Employee.department == department)
    result = await db.execute(query.order_by(Attendance.date.desc()))
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Employee ID", "First Name", "Last Name", "Date",
        "Check In", "Check Out", "Status",
    ])
    for att, emp in rows:
        writer.writerow([
            emp.employee_id, emp.first_name, emp.last_name,
            att.date.isoformat(), att.check_in or "", att.check_out or "", att.status,
        ])

    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=attendance.csv"},
    )


@router.get("/export/leaves.csv")
async def export_leaves_csv(
    date_from: str = Query("", description="YYYY-MM-DD"),
    date_to: str = Query("", description="YYYY-MM-DD"),
    status_filter: str = Query("", alias="status", description="PENDING | APPROVED | REJECTED"),
    employee: str = Query("", description="employee_id filter"),
    department: str = Query(""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR, UserRole.MANAGER)),
):
    df, dt_val = _parse_csv_dates(date_from, date_to)
    if status_filter and status_filter.upper() not in ("PENDING", "APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Invalid leave status filter")

    q = select(LeaveRecord, Employee).join(Employee, LeaveRecord.employee_id == Employee.id)

    # Manager exports only their team's leave.
    if current_user.role == UserRole.MANAGER.value:
        my_employee = (await db.execute(
            select(Employee).where(Employee.user_id == current_user.id)
        )).scalar_one_or_none()
        if my_employee is None:
            q = q.where(False)
        else:
            team_ids = (await db.execute(
                select(Employee.id).where(Employee.manager_id == my_employee.id)
            )).scalars().all()
            q = q.where(LeaveRecord.employee_id.in_(team_ids))

    if df:
        q = q.where(LeaveRecord.start_date >= df)
    if dt_val:
        q = q.where(LeaveRecord.end_date <= dt_val)
    if status_filter:
        q = q.where(func.upper(LeaveRecord.status) == status_filter.upper())
    if employee:
        emp = (await db.execute(
            select(Employee).where(Employee.employee_id == employee)
        )).scalar_one_or_none()
        if emp is None:
            return Response(content="\ufeffEmployee ID not found", media_type="text/csv; charset=utf-8",
                            headers={"Content-Disposition": "attachment; filename=leaves.csv"})
        q = q.where(LeaveRecord.employee_id == emp.id)
    if department:
        q = q.where(Employee.department == department)

    result = await db.execute(q.order_by(LeaveRecord.id.desc()))
    leaves = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Employee ID", "Leave Type", "Start Date",
        "End Date", "Status", "Reason",
    ])
    for l, emp in leaves:
        writer.writerow([
            l.id, emp.employee_id if emp else l.employee_id, l.leave_type,
            l.start_date.isoformat(), l.end_date.isoformat(), l.status, l.reason or "",
        ])

    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=leaves.csv"},
    )
