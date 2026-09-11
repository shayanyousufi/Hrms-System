"""HR Reporting endpoints.

Real PostgreSQL aggregation only — no hardcoded statistics. RBAC-aware:
  - SUPER_ADMIN / HR  → organization-wide (optionally narrowed by filters)
  - MANAGER           → their direct-report team only
  - EMPLOYEE          → their own record only

CSV export reuses the existing /api/employees/export/* endpoints (bulk exports).
PDF export is purpose-built here from the same report renderers.
"""
import io
from datetime import date as date_type, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select, func, case, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import UserRole
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.employee import Attendance, Employee, LeaveRecord
from app.models.user import User
from app.schemas.reports import (
    AttendanceReportResponse, AttendanceReportRow, LeaveReportResponse,
    LeaveReportRow, EmployeeReportResponse, EmployeeReportRow, ReportFilters,
)

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(get_current_user)])

_SALARY_ROLES = {UserRole.SUPER_ADMIN.value, UserRole.HR.value}


def _parse_date(value: str, name: str) -> Optional[date_type]:
    if not value:
        return None
    try:
        return date_type.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {name}, use YYYY-MM-DD")


async def _own_employee(db: AsyncSession, current_user: User) -> Optional[Employee]:
    return (await db.execute(
        select(Employee).where(Employee.user_id == current_user.id)
    )).scalar_one_or_none()


async def _team_ids(db: AsyncSession, current_user: User) -> tuple:
    my = await _own_employee(db, current_user)
    if my is None:
        return ()
    team = (await db.execute(
        select(Employee.id).where(Employee.manager_id == my.id)
    )).scalars().all()
    return tuple(team)


async def _scope(db: AsyncSession, current_user: User) -> Optional[tuple]:
    """Return team/self employee-id restriction, or None for org-wide access."""
    if current_user.role in _SALARY_ROLES:
        return None
    if current_user.role == UserRole.MANAGER.value:
        return await _team_ids(db, current_user)
    # EMPLOYEE: always their own record.
    my = await _own_employee(db, current_user)
    if my is None:
        return ()
    return (my.id,)


async def _assert_employee_allowed(
    db: AsyncSession, current_user: User, scope: Optional[tuple], employee_filter: str
) -> Optional[int]:
    """Validate an ?employee=<employee_id> filter against the user's scope.

    Returns the matched employee's integer id, or None when no filter given.
    """
    if not employee_filter:
        return None
    emp = (await db.execute(
        select(Employee).where(Employee.employee_id == employee_filter)
    )).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    if scope is not None and emp.id not in scope:
        raise HTTPException(status_code=403, detail="You can only view your own or your team's data")
    return emp.id


def _scope_label(current_user: User) -> str:
    if current_user.role in _SALARY_ROLES:
        return "organization"
    if current_user.role == UserRole.MANAGER.value:
        return "team"
    return "self"


# ---------------------------------------------------------------------------
# Attendance report
# ---------------------------------------------------------------------------

@router.get("/attendance", response_model=AttendanceReportResponse)
async def attendance_report(
    date_from: str = Query("", description="YYYY-MM-DD"),
    date_to: str = Query("", description="YYYY-MM-DD"),
    employee: str = Query("", description="employee_id filter, e.g. EMP-1003"),
    department: str = Query(""),
    status_filter: str = Query("", alias="status", description="Present | Late | Absent"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    df = _parse_date(date_from, "date_from")
    dt_val = _parse_date(date_to, "date_to")
    if df and dt_val and df > dt_val:
        raise HTTPException(status_code=400, detail="date_from cannot be after date_to")

    scope = await _scope(db, current_user)
    emp_id = await _assert_employee_allowed(db, current_user, scope, employee)

    filters = []
    if df:
        filters.append(Attendance.date >= df)
    if dt_val:
        filters.append(Attendance.date <= dt_val)
    if emp_id:
        filters.append(Attendance.employee_id == emp_id)
    else:
        employee_scope = scope
        if employee_scope is not None:
            filters.append(Attendance.employee_id.in_(employee_scope or ()))

    att_col = Attendance.status
    status_bucket = case(
        (att_col == "Present", "Present"),
        (att_col == "Late", "Late"),
        (att_col.in_(["Leave", "On Leave", "Holiday"]), "Leave"),
        else_=att_col,
    )
    rows_query = (
        select(
            Employee.employee_id, Employee.first_name, Employee.last_name,
            Employee.department, Employee.designation,
            func.count(Attendance.id).label("total_days"),
            func.sum(case((status_bucket == "Present", 1), else_=0)).label("present"),
            func.sum(case((status_bucket == "Late", 1), else_=0)).label("late"),
            func.sum(case((status_bucket == "Absent", 1), else_=0)).label("absent"),
            func.sum(case((status_bucket == "Leave", 1), else_=0)).label("leave"),
        )
        .join(Employee, Employee.id == Attendance.employee_id)
        .where(*filters)
        .group_by(
            Employee.employee_id, Employee.first_name, Employee.last_name,
            Employee.department, Employee.designation,
        )
    )

    if department:
        rows_query = rows_query.where(Employee.department == department)
    if status_filter:
        if status_filter not in ("Present", "Late", "Absent"):
            raise HTTPException(status_code=400, detail="Invalid attendance status filter")
        rows_query = rows_query.having(status_bucket == status_filter)

    rows = (await db.execute(rows_query)).all()

    total_present = sum(r.present or 0 for r in rows)
    total_late = sum(r.late or 0 for r in rows)
    total_absent = sum(r.absent or 0 for r in rows)
    total_leave = sum(r.leave or 0 for r in rows)
    total_records = total_present + total_late + total_absent + total_leave

    out_rows = []
    for r in rows:
        rec = r.present + r.late + r.absent + r.leave or 0
        percentage = round((r.present + r.late) / rec * 100, 1) if rec else 0.0
        out_rows.append(AttendanceReportRow(
            employee_id=r.employee_id, first_name=r.first_name, last_name=r.last_name,
            department=r.department, designation=r.designation,
            total_days=r.total_days or 0, present=r.present or 0, late=r.late or 0,
            absent=r.absent or 0, leave=r.leave or 0,
            attendance_percentage=percentage,
        ))

    attendance_percentage = round((total_present + total_late) / total_records * 100, 1) if total_records else 0.0

    return AttendanceReportResponse(
        filters=ReportFilters(
            date_from=date_from or None, date_to=date_to or None,
            employee=employee or None, department=department or None,
            status=status_filter or None, scope=_scope_label(current_user),
        ),
        total_records=total_records, present=total_present, late=total_late,
        absent=total_absent, leave=total_leave, attendance_percentage=attendance_percentage,
        rows=out_rows,
    )


# ---------------------------------------------------------------------------
# Leave report
# ---------------------------------------------------------------------------

@router.get("/leaves", response_model=LeaveReportResponse)
async def leave_report(
    date_from: str = Query("", description="YYYY-MM-DD"),
    date_to: str = Query("", description="YYYY-MM-DD"),
    employee: str = Query("", description="employee_id filter"),
    department: str = Query(""),
    leave_type: str = Query(""),
    status_filter: str = Query("", alias="status", description="PENDING | APPROVED | REJECTED"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    df = _parse_date(date_from, "date_from")
    dt_val = _parse_date(date_to, "date_to")
    if df and dt_val and df > dt_val:
        raise HTTPException(status_code=400, detail="date_from cannot be after date_to")
    if status_filter and status_filter.upper() not in ("PENDING", "APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Invalid leave status filter")

    scope = await _scope(db, current_user)
    emp_id = await _assert_employee_allowed(db, current_user, scope, employee)

    filters = [LeaveRecord.start_date <= (dt_val or date_type.max), LeaveRecord.end_date >= (df or date_type.min)]
    if emp_id:
        filters.append(LeaveRecord.employee_id == emp_id)
    else:
        employee_scope = scope
        if employee_scope is not None:
            filters.append(LeaveRecord.employee_id.in_(employee_scope or ()))

    days_expr = LeaveRecord.end_date - LeaveRecord.start_date + case((LeaveRecord.end_date == LeaveRecord.start_date, 1), else_=1)

    rows_query = (
        select(
            Employee.employee_id, Employee.first_name, Employee.last_name,
            Employee.department, LeaveRecord.leave_type,
            func.count(LeaveRecord.id).label("total_requests"),
            func.sum(case((LeaveRecord.status == "Approved", 1), else_=0)).label("approved"),
            func.sum(case((LeaveRecord.status == "Pending", 1), else_=0)).label("pending"),
            func.sum(case((LeaveRecord.status == "Rejected", 1), else_=0)).label("rejected"),
            func.sum(days_expr).label("days_taken"),
        )
        .join(Employee, Employee.id == LeaveRecord.employee_id)
        .where(*filters)
        .group_by(
            Employee.employee_id, Employee.first_name, Employee.last_name,
            Employee.department, LeaveRecord.leave_type,
        )
    )

    if department:
        rows_query = rows_query.where(Employee.department == department)
    if leave_type:
        rows_query = rows_query.where(LeaveRecord.leave_type.ilike(f"%{leave_type}%"))
    if status_filter:
        rows_query = rows_query.where(func.upper(LeaveRecord.status) == status_filter.upper())

    rows = (await db.execute(rows_query)).all()

    total_requests = sum(r.total_requests or 0 for r in rows)
    total_approved = sum(r.approved or 0 for r in rows)
    total_pending = sum(r.pending or 0 for r in rows)
    total_rejected = sum(r.rejected or 0 for r in rows)
    total_days = sum(r.days_taken or 0 for r in rows)

    out_rows = [LeaveReportRow(
        employee_id=r.employee_id, first_name=r.first_name, last_name=r.last_name,
        department=r.department, leave_type=r.leave_type,
        total_requests=r.total_requests or 0, approved=r.approved or 0,
        pending=r.pending or 0, rejected=r.rejected or 0, days_taken=r.days_taken or 0,
    ) for r in rows]

    return LeaveReportResponse(
        filters=ReportFilters(
            date_from=date_from or None, date_to=date_to or None,
            employee=employee or None, department=department or None,
            status=status_filter.upper() if status_filter else None,
            leave_type=leave_type or None, scope=_scope_label(current_user),
        ),
        total_requests=total_requests, approved=total_approved, pending=total_pending,
        rejected=total_rejected, days_taken=total_days, rows=out_rows,
    )


# ---------------------------------------------------------------------------
# Employee report
# ---------------------------------------------------------------------------

@router.get("/employees", response_model=EmployeeReportResponse)
async def employee_report(
    department: str = Query(""),
    status_filter: str = Query("", alias="status"),
    employee: str = Query("", description="employee_id filter"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scope = await _scope(db, current_user)
    emp_id = await _assert_employee_allowed(db, current_user, scope, employee)

    query = select(Employee)
    if emp_id:
        query = query.where(Employee.id == emp_id)
    else:
        employee_scope = scope
        if employee_scope is not None:
            query = query.where(Employee.id.in_(employee_scope or ()))
    if department:
        query = query.where(Employee.department == department)
    if status_filter:
        query = query.where(Employee.employment_status == status_filter)

    employees = (await db.execute(query.order_by(Employee.id))).scalars().all()

    include_salary = current_user.role in _SALARY_ROLES

    rows = [EmployeeReportRow(
        id=e.id, employee_id=e.employee_id, first_name=e.first_name, last_name=e.last_name,
        email=e.email, department=e.department, designation=e.designation,
        employment_status=e.employment_status, joining_date=e.joining_date,
        salary=float(e.salary) if include_salary and e.salary is not None else None,
    ) for e in employees]

    return EmployeeReportResponse(
        filters=ReportFilters(
            department=department or None, status=status_filter or None,
            employee=employee or None, scope=_scope_label(current_user),
        ),
        total=len(rows), includes_salary=include_salary, rows=rows,
    )


# ---------------------------------------------------------------------------
# PDF export (reportlab)
# ---------------------------------------------------------------------------

def _render_pdf(title: str, subtitle: str, headers: list, rows: list, summary: list) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleX", parent=styles["Title"], fontSize=16, spaceAfter=2)
    sub_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=8, textColor=colors.grey, spaceAfter=8)
    label_style = ParagraphStyle("Label", parent=styles["Normal"], fontSize=9, leading=12)

    story = [
        Paragraph("Tech Land HRMS", title_style),
        Paragraph(subtitle, sub_style),
        Paragraph("Generated: " + datetime.now().strftime("%Y-%m-%d %H:%M") + " &nbsp; " +
                  "| &nbsp; " + title, label_style),
    ]

    if summary:
        story.append(Spacer(1, 4 * mm))
        story.append(Paragraph(" &nbsp; &middot; &nbsp; ".join(summary), label_style))

    story.append(Spacer(1, 6 * mm))

    def _clean(v):
        if v is None:
            return ""
        s = str(v)
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;") if isinstance(v, str) else s

    data = [[Paragraph(_clean(h), label_style) for h in headers]]
    for r in rows:
        data.append([_clean(c) for c in r])

    table = Table(data, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4C1D95")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E5E7EB")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9F5FF")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(table)
    doc.build(story)
    return buf.getvalue()


def _pdf_response(data: bytes, filename: str) -> Response:
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/attendance/export.pdf")
async def attendance_pdf(
    date_from: str = Query(""), date_to: str = Query(""),
    employee: str = Query(""), department: str = Query(""),
    status_filter: str = Query("", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await attendance_report(date_from, date_to, employee, department, status_filter, db, current_user)
    headers = ["Employee", "Department", "Designation", "Days", "Present", "Late", "Absent", "Leave", "Rate%"]
    rows = [[f"{r.first_name} {r.last_name} ({r.employee_id})", r.department, r.designation,
             r.total_days, r.present, r.late, r.absent, r.leave, r.attendance_percentage] for r in report.rows]
    summary = [
        f"Total records: {report.total_records}",
        f"Present: {report.present}",
        f"Late: {report.late}",
        f"Absent: {report.absent}",
        f"Leave: {report.leave}",
        f"Attendance: {report.attendance_percentage}%",
    ]
    filters = " · ".join(f"{k}={v}" for k, v in {
        "date_from": report.filters.date_from, "date_to": report.filters.date_to,
        "employee": report.filters.employee, "department": report.filters.department,
        "status": report.filters.status,
    }.items() if v)
    return _pdf_response(_render_pdf("Attendance Report", filters or "All records", headers, rows, summary), "attendance-report.pdf")


@router.get("/leaves/export.pdf")
async def leaves_pdf(
    date_from: str = Query(""), date_to: str = Query(""),
    employee: str = Query(""), department: str = Query(""),
    leave_type: str = Query(""), status_filter: str = Query("", alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await leave_report(date_from, date_to, employee, department, leave_type, status_filter, db, current_user)
    headers = ["Employee", "Department", "Type", "Requests", "Approved", "Pending", "Rejected", "Days Taken"]
    rows = [[f"{r.first_name} {r.last_name} ({r.employee_id})", r.department, r.leave_type or "—",
             r.total_requests, r.approved, r.pending, r.rejected, r.days_taken] for r in report.rows]
    summary = [
        f"Total requests: {report.total_requests}",
        f"Approved: {report.approved}",
        f"Pending: {report.pending}",
        f"Rejected: {report.rejected}",
        f"Days taken: {report.days_taken}",
    ]
    filters = " · ".join(f"{k}={v}" for k, v in {
        "date_from": report.filters.date_from, "date_to": report.filters.date_to,
        "employee": report.filters.employee, "department": report.filters.department,
        "leave_type": report.filters.leave_type, "status": report.filters.status,
    }.items() if v)
    return _pdf_response(_render_pdf("Leave Report", filters or "All records", headers, rows, summary), "leave-report.pdf")


@router.get("/employees/export.pdf")
async def employees_pdf(
    department: str = Query(""), status_filter: str = Query("", alias="status"),
    employee: str = Query(""),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = await employee_report(department, status_filter, employee, db, current_user)
    headers = ["Employee ID", "Name", "Email", "Department", "Designation", "Status", "Joining"]
    if report.includes_salary:
        headers.append("Salary")
        rows = [[r.employee_id, f"{r.first_name} {r.last_name}", r.email, r.department,
                 r.designation, r.employment_status, r.joining_date.isoformat(),
                 (f"{r.salary:,.2f}" if r.salary is not None else "—")] for r in report.rows]
    else:
        rows = [[r.employee_id, f"{r.first_name} {r.last_name}", r.email, r.department,
                 r.designation, r.employment_status, r.joining_date.isoformat()] for r in report.rows]

    summary = [f"Total employees: {report.total}", f"Scope: {report.filters.scope}"]
    if report.includes_salary:
        summary.append("Includes salary")
    filters = " · ".join(f"{k}={v}" for k, v in {
        "department": report.filters.department, "status": report.filters.status,
        "employee": report.filters.employee,
    }.items() if v)
    return _pdf_response(_render_pdf("Employee Report", filters or "All employees", headers, rows, summary), "employee-report.pdf")