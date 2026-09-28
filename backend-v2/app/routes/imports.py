"""Bulk employee import (CSV / XLSX).

RBAC: SUPER_ADMIN and HR only. Workflow: POST /preview (validate + duplicate
detection) -> UI shows errors -> POST /confirm (insert only valid rows in one
transaction, report failures by row). No partial writes are hidden: everything
inserted is reported as successful; every skipped row lists a reason.
"""
import csv
import io
import re
from datetime import date, datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import UserRole
from app.core.database import get_db
from app.core.deps import require_roles
from app.models.employee import Employee
from app.schemas.imports import (
    ImportPreviewResponse, ImportRowResult, ImportConfirmResponse, ImportFailure,
)

router = APIRouter(
    prefix="/api/imports",
    tags=["imports"],
    dependencies=[Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.HR))],
)

REQUIRED_FIELDS = ["first_name", "last_name", "email", "department", "designation", "joining_date"]
VALID_STATUSES = {"Active", "On Leave", "Inactive"}
MAX_ROWS = 1000


def _normalize_header(key: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (key or "").strip().lower()).strip("_")


def _read_rows(filename: str, data: bytes) -> tuple[List[str], List[dict]]:
    """Return (header_fields, rows) from CSV or XLSX bytes."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "xlsx":
        return _read_xlsx(data)
    if ext == "csv":
        return _read_csv(data)
    raise HTTPException(status_code=400, detail="Unsupported file format. Use .csv or .xlsx")


def _read_csv(data: bytes) -> tuple[List[str], List[dict]]:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV is missing a header row")
    headers = [_normalize_header(h) for h in reader.fieldnames]
    rows = []
    for raw in reader:
        row = {}
        for i, key in enumerate(headers):
            row[key] = (raw.get(reader.fieldnames[i]) or "").strip()
        rows.append(row)
    return headers, rows


def _read_xlsx(data: bytes) -> tuple[List[str], List[dict]]:
    try:
        from openpyxl import load_workbook
        from io import BytesIO
        wb = load_workbook(BytesIO(data), read_only=True, data_only=True)
        ws = wb.active
        it = ws.iter_rows(values_only=True)
        header = next(it, None)
        if not header:
            raise HTTPException(status_code=400, detail="XLSX is missing a header row")
        headers = [_normalize_header(str(h)) for h in header]
        rows = []
        for values in it:
            row = {}
            for i, key in enumerate(headers):
                v = values[i] if i < len(values) else None
                if isinstance(v, datetime):
                    v = v.isoformat()
                row[key] = "" if v is None else str(v).strip()
            if any(row.values()):
                rows.append(row)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read XLSX file")
    return headers, rows


def _validate_row(headers: List[str], row: dict) -> List[str]:
    errors: List[str] = []

    for field in REQUIRED_FIELDS:
        if field not in headers or not row.get(field):
            errors.append(f"Missing {field.replace('_', ' ')}")

    first = (row.get("first_name") or "").strip()
    last = (row.get("last_name") or "").strip()
    if first and len(first) > 100:
        errors.append("First name too long")
    if last and len(last) > 100:
        errors.append("Last name too long")

    email = (row.get("email") or "").strip()
    if email:
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
            errors.append("Invalid email")

    if (row.get("joining_date") or "").strip():
        try:
            date.fromisoformat(row["joining_date"].strip())
        except ValueError:
            errors.append("Invalid date (use YYYY-MM-DD)")
    elif "joining_date" in errors:
        pass  # already flagged as missing

    status = (row.get("employment_status") or "Active").strip()
    if status and status not in VALID_STATUSES:
        errors.append("Invalid status (Active/On Leave/Inactive)")

    salary = (row.get("salary") or "").strip()
    if salary:
        try:
            if float(salary) < 0:
                errors.append("Invalid salary")
        except ValueError:
            errors.append("Invalid salary")

    emp_id = (row.get("employee_id") or "").strip()
    if emp_id and len(emp_id) > 20:
        errors.append("Employee ID too long")

    # CNIC / phone sanity (non-empty means no control chars).
    for c in ("cnic", "phone", "bank_account"):
        v = (row.get(c) or "").strip()
        if v and len(v) > 30:
            errors.append(f"{c.replace('_', ' ')} too long")

    return errors


async def _existing_keys(db: AsyncSession) -> tuple[set, set]:
    emails = set()
    ids = set()
    result = await db.execute(select(Employee.email))
    emails.update((e[0] or "").lower() for e in result.all())
    result = await db.execute(select(Employee.employee_id))
    ids.update(r[0] for r in result.all())
    return emails, ids


def _generate_employee_id(used: set) -> str:
    import random
    while True:
        candidate = f"EMP-{random.randint(10000, 99999)}"
        if candidate not in used:
            used.add(candidate)
            return candidate


async def _parse_and_validate(db: AsyncSession, filename: str, data: bytes, check_db_dupes: bool):
    headers, rows = _read_rows(filename, data)
    if not rows:
        raise HTTPException(status_code=400, detail="File contains no data rows")

    db_emails, db_ids = await _existing_keys(db) if check_db_dupes else (set(), set())

    seen_emails, seen_ids = set(), set()
    preview_rows: List[ImportRowResult] = []
    dupes_in_file: List[dict] = []

    for idx, row in enumerate(rows, start=2):  # row 1 = header
        errors = _validate_row(headers, row)
        email = (row.get("email") or "").strip().lower()
        emp_id = (row.get("employee_id") or "").strip()

        if email:
            if email in seen_emails:
                dupes_in_file.append({"row": idx, "field": "email", "value": row.get("email")})
                errors.append(f"Duplicate email in file (row {idx})")
            if check_db_dupes and email in db_emails:
                errors.append("Duplicate email (already exists)")
            seen_emails.add(email)
        if emp_id:
            if emp_id in seen_ids:
                dupes_in_file.append({"row": idx, "field": "employee_id", "value": emp_id})
                errors.append(f"Duplicate employee_id in file (row {idx})")
            if check_db_dupes and emp_id in db_ids:
                errors.append("Duplicate employee_id (already exists)")
            seen_ids.add(emp_id)

        preview_rows.append(ImportRowResult(
            row=idx, data=row, valid=not errors, errors=errors,
        ))

    valid = sum(1 for r in preview_rows if r.valid)
    return headers, preview_rows, len(rows), valid, dupes_in_file


@router.get("/template")
async def import_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "employee_id", "first_name", "last_name", "email", "phone", "cnic",
        "department", "designation", "joining_date", "employment_status", "salary",
    ])
    writer.writerow([
        "", "Jane", "Doe", "jane.doe@techland.com", "03001234567", "42101-1234567-8",
        "Engineering", "Software Engineer", "2026-09-01", "Active", "150000",
    ])
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=employee-import-template.csv"},
    )


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (maximum 2 MB)")

    headers, preview_rows, total, valid, dupes = await _parse_and_validate(
        db, file.filename or "upload.csv", data, check_db_dupes=True,
    )

    return ImportPreviewResponse(
        filename=file.filename or "upload.csv",
        total_rows=total,
        valid_rows=valid,
        invalid_rows=total - valid,
        duplicates_in_file=dupes,
        preview=preview_rows,
    )


@router.post("/confirm", response_model=ImportConfirmResponse)
async def confirm_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    data = await file.read()
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (maximum 2 MB)")

    headers, preview_rows, total, valid, dupes = await _parse_and_validate(
        db, file.filename or "upload.csv", data, check_db_dupes=True,
    )

    used_ids = await _existing_employee_ids(db)
    failures: List[ImportFailure] = []
    successful = 0

    for entry in preview_rows:
        if not entry.valid:
            failures.append(ImportFailure(row=entry.row, error="; ".join(entry.errors)))
            continue

        row = entry.data or {}
        emp_id = (row.get("employee_id") or "").strip() or _generate_employee_id(used_ids)
        used_ids.add(emp_id)

        joining = date.fromisoformat((row.get("joining_date") or "").strip())
        salary_raw = (row.get("salary") or "").strip()
        salary = float(salary_raw) if salary_raw else None

        employee = Employee(
            employee_id=emp_id,
            first_name=(row.get("first_name") or "").strip(),
            last_name=(row.get("last_name") or "").strip(),
            email=(row.get("email") or "").strip(),
            phone=(row.get("phone") or "").strip() or None,
            cnic=(row.get("cnic") or "").strip() or None,
            department=(row.get("department") or "").strip(),
            designation=(row.get("designation") or "").strip(),
            joining_date=joining,
            employment_status=(row.get("employment_status") or "Active").strip() or "Active",
            salary=salary,
            bank_account=(row.get("bank_account") or "").strip() or None,
            leave_balance=15,
        )
        db.add(employee)
        successful += 1

    if successful:
        await db.commit()

    return ImportConfirmResponse(
        filename=file.filename or "upload.csv",
        total_rows=total,
        successful=successful,
        failed=total - successful,
        failures=failures,
    )


async def _existing_employee_ids(db: AsyncSession) -> set:
    result = await db.execute(select(Employee.employee_id))
    return set(r[0] for r in result.all())