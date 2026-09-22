"""Payroll Phase 1 routes.

RBAC:
  - SUPER_ADMIN / HR  → full CRUD on runs and payslips
  - SUPER_ADMIN only  → finalize / mark as paid
  - EMPLOYEE          → (Phase 2: view own payslip)
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import UserRole
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.employee import Employee
from app.models.payroll import (
    PayrollRun, Payslip, PayslipAllowance, PayslipDeduction,
)
from app.models.user import User
from app.schemas.payroll import (
    PayrollRunCreate, PayrollRunOut, PayslipCreate, PayslipOut,
    BulkPayslipCreate, AllowanceIn, DeductionIn,
    AllowanceOut, DeductionOut, ALLOWANCE_CATEGORIES, DEDUCTION_CATEGORIES,
    PAYROLL_STATUSES,
)

router = APIRouter(prefix="/api/payroll", tags=["payroll"])

_HR_ROLES = (UserRole.SUPER_ADMIN, UserRole.HR)
_ADMIN_ONLY = (UserRole.SUPER_ADMIN,)


async def _get_run_or_404(db: AsyncSession, run_id: int) -> PayrollRun:
    result = await db.execute(
        select(PayrollRun).where(PayrollRun.id == run_id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    return run


async def _get_payslip_or_404(db: AsyncSession, payslip_id: int) -> Payslip:
    result = await db.execute(
        select(Payslip)
        .options(
            selectinload(Payslip.allowances),
            selectinload(Payslip.deductions),
        )
        .where(Payslip.id == payslip_id)
    )
    payslip = result.scalar_one_or_none()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return payslip


async def _recalc_net_pay(db: AsyncSession, payslip: Payslip) -> None:
    base = payslip.base_salary
    pid = payslip.id
    total_allow = (await db.execute(
        select(func.coalesce(func.sum(PayslipAllowance.amount), 0))
        .where(PayslipAllowance.payslip_id == pid)
    )).scalar()
    total_deduct = (await db.execute(
        select(func.coalesce(func.sum(PayslipDeduction.amount), 0))
        .where(PayslipDeduction.payslip_id == pid)
    )).scalar()
    db.expire(payslip)
    payslip.net_pay = Decimal(str(base)) + Decimal(str(total_allow)) - Decimal(str(total_deduct))
    db.add(payslip)
    await db.flush()


# ──────────────────── PAYROLL RUNS ────────────────────


@router.get("/runs", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def list_runs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PayrollRun).options(
            selectinload(PayrollRun.payslips),
            selectinload(PayrollRun.creator),
        ).order_by(PayrollRun.period.desc())
    )
    runs = result.scalars().all()

    out = []
    for r in runs:
        payslips = r.payslips or []
        total = sum(Decimal(str(p.net_pay)) for p in payslips)
        out.append(PayrollRunOut(
            id=r.id,
            period=r.period,
            status=r.status,
            created_by=r.created_by,
            creator_email=r.creator.email if r.creator else None,
            payslip_count=len(payslips),
            total_net_pay=total,
            created_at=r.created_at.isoformat() if r.created_at else None,
        ))
    return out


@router.post("/runs", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles(*_HR_ROLES))])
async def create_run(
    data: PayrollRunCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(
        select(PayrollRun).where(PayrollRun.period == data.period)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Run already exists for {data.period}")

    run = PayrollRun(period=data.period, status="draft", created_by=current_user.id)
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return PayrollRunOut(
        id=run.id, period=run.period, status=run.status,
        created_by=run.created_by, creator_email=current_user.email,
        payslip_count=0, total_net_pay=Decimal("0"),
        created_at=run.created_at.isoformat() if run.created_at else None,
    )


@router.get("/runs/{run_id}", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await _get_run_or_404(db, run_id)

    result = await db.execute(
        select(Payslip)
        .options(selectinload(Payslip.allowances), selectinload(Payslip.deductions), selectinload(Payslip.employee))
        .where(Payslip.payroll_run_id == run_id)
    )
    payslips = result.scalars().all()

    payslip_outs = []
    total = Decimal("0")
    for p in payslips:
        emp = p.employee
        total_allow = sum(Decimal(str(a.amount)) for a in p.allowances)
        total_deduct = sum(Decimal(str(d.amount)) for d in p.deductions)
        payslip_outs.append(PayslipOut(
            id=p.id,
            payroll_run_id=p.payroll_run_id,
            employee_id=p.employee_id,
            employee_name=f"{emp.first_name} {emp.last_name}" if emp else None,
            employee_code=emp.employee_id if emp else None,
            base_salary=p.base_salary,
            net_pay=p.net_pay,
            status=p.status,
            allowances=[AllowanceOut.model_validate(a) for a in p.allowances],
            deductions=[DeductionOut.model_validate(d) for d in p.deductions],
            total_allowances=total_allow,
            total_deductions=total_deduct,
            created_at=p.created_at.isoformat() if p.created_at else None,
        ))
        total += Decimal(str(p.net_pay))

    return PayrollRunOut(
        id=run.id, period=run.period, status=run.status,
        created_by=run.created_by,
        payslip_count=len(payslips), total_net_pay=total,
        created_at=run.created_at.isoformat() if run.created_at else None,
        payslips=payslip_outs,
    )


@router.patch("/runs/{run_id}", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def update_run_status(
    run_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    run = await _get_run_or_404(db, run_id)
    new_status = data.get("status", "").strip().lower()

    if new_status not in PAYROLL_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {', '.join(sorted(PAYROLL_STATUSES))}")

    if run.status == "paid":
        raise HTTPException(status_code=400, detail="Cannot change status of a paid run")

    if new_status == "finalized" and not current_user.has_role(UserRole.SUPER_ADMIN.value):
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can finalize runs")

    if new_status == "paid" and not current_user.has_role(UserRole.SUPER_ADMIN.value):
        raise HTTPException(status_code=403, detail="Only SUPER_ADMIN can mark runs as paid")

    if run.status == "draft" and new_status == "paid":
        raise HTTPException(status_code=400, detail="Must finalize before marking as paid")

    run.status = new_status
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return {"id": run.id, "period": run.period, "status": run.status}


@router.delete("/runs/{run_id}", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def delete_run(run_id: int, db: AsyncSession = Depends(get_db)):
    run = await _get_run_or_404(db, run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft runs can be deleted")
    await db.delete(run)
    await db.commit()
    return {"detail": "Run deleted"}


# ──────────────────── PAYSLIPS ────────────────────


@router.post("/runs/{run_id}/payslips", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles(*_HR_ROLES))])
async def add_payslip(
    run_id: int,
    data: PayslipCreate,
    db: AsyncSession = Depends(get_db),
):
    run = await _get_run_or_404(db, run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Can only add payslips to draft runs")

    emp = (await db.execute(
        select(Employee).where(Employee.id == data.employee_id)
    )).scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    existing = (await db.execute(
        select(Payslip).where(
            Payslip.payroll_run_id == run_id,
            Payslip.employee_id == data.employee_id,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Payslip already exists for this employee in this run")

    payslip = Payslip(
        payroll_run_id=run_id,
        employee_id=data.employee_id,
        base_salary=Decimal(str(emp.salary or 0)),
        net_pay=Decimal(str(emp.salary or 0)),
        status="draft",
    )
    db.add(payslip)
    await db.commit()
    await db.refresh(payslip)
    return PayslipOut(
        id=payslip.id, payroll_run_id=payslip.payroll_run_id,
        employee_id=payslip.employee_id,
        employee_name=f"{emp.first_name} {emp.last_name}",
        employee_code=emp.employee_id,
        base_salary=payslip.base_salary, net_pay=payslip.net_pay,
        status=payslip.status,
    )


@router.post("/runs/{run_id}/payslips/bulk", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles(*_HR_ROLES))])
async def add_payslips_bulk(
    run_id: int,
    data: BulkPayslipCreate,
    db: AsyncSession = Depends(get_db),
):
    run = await _get_run_or_404(db, run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Can only add payslips to draft runs")

    created = []
    skipped = []
    for emp_id in data.employee_ids:
        emp = (await db.execute(select(Employee).where(Employee.id == emp_id))).scalar_one_or_none()
        if not emp:
            skipped.append(emp_id)
            continue
        existing = (await db.execute(
            select(Payslip).where(Payslip.payroll_run_id == run_id, Payslip.employee_id == emp_id)
        )).scalar_one_or_none()
        if existing:
            skipped.append(emp_id)
            continue
        payslip = Payslip(
            payroll_run_id=run_id, employee_id=emp_id,
            base_salary=Decimal(str(emp.salary or 0)),
            net_pay=Decimal(str(emp.salary or 0)),
            status="draft",
        )
        db.add(payslip)
        created.append(emp_id)

    await db.commit()
    return {"created": len(created), "skipped": len(skipped), "skipped_ids": skipped}


@router.delete("/runs/{run_id}/payslips/{payslip_id}", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def remove_payslip(run_id: int, payslip_id: int, db: AsyncSession = Depends(get_db)):
    run = await _get_run_or_404(db, run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Can only remove payslips from draft runs")
    payslip = await _get_payslip_or_404(db, payslip_id)
    if payslip.payroll_run_id != run_id:
        raise HTTPException(status_code=400, detail="Payslip does not belong to this run")
    await db.delete(payslip)
    await db.commit()
    return {"detail": "Payslip removed"}


# ──────────────────── ALLOWANCES ────────────────────


@router.post("/payslips/{payslip_id}/allowances", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles(*_HR_ROLES))])
async def add_allowance(payslip_id: int, data: AllowanceIn, db: AsyncSession = Depends(get_db)):
    payslip = await _get_payslip_or_404(db, payslip_id)
    if payslip.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit draft payslips")
    run = await _get_run_or_404(db, payslip.payroll_run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit payslips in draft runs")

    existing = (await db.execute(
        select(PayslipAllowance).where(
            PayslipAllowance.payslip_id == payslip_id,
            PayslipAllowance.category == data.category,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Allowance '{data.category}' already exists for this payslip")

    allowance = PayslipAllowance(payslip_id=payslip_id, category=data.category, amount=data.amount)
    db.add(allowance)
    await db.flush()
    await _recalc_net_pay(db, payslip)
    await db.commit()
    await db.refresh(allowance)
    return AllowanceOut.model_validate(allowance)


@router.delete("/payslips/{payslip_id}/allowances/{allowance_id}", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def remove_allowance(payslip_id: int, allowance_id: int, db: AsyncSession = Depends(get_db)):
    payslip = await _get_payslip_or_404(db, payslip_id)
    if payslip.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit draft payslips")
    run = await _get_run_or_404(db, payslip.payroll_run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit payslips in draft runs")

    allowance = (await db.execute(
        select(PayslipAllowance).where(
            PayslipAllowance.id == allowance_id,
            PayslipAllowance.payslip_id == payslip_id,
        )
    )).scalar_one_or_none()
    if not allowance:
        raise HTTPException(status_code=404, detail="Allowance not found")

    await db.delete(allowance)
    await db.flush()
    await _recalc_net_pay(db, payslip)
    await db.commit()
    return {"detail": "Allowance removed"}


# ──────────────────── DEDUCTIONS ────────────────────


@router.post("/payslips/{payslip_id}/deductions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_roles(*_HR_ROLES))])
async def add_deduction(payslip_id: int, data: DeductionIn, db: AsyncSession = Depends(get_db)):
    payslip = await _get_payslip_or_404(db, payslip_id)
    if payslip.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit draft payslips")
    run = await _get_run_or_404(db, payslip.payroll_run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit payslips in draft runs")

    existing = (await db.execute(
        select(PayslipDeduction).where(
            PayslipDeduction.payslip_id == payslip_id,
            PayslipDeduction.category == data.category,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Deduction '{data.category}' already exists for this payslip")

    deduction = PayslipDeduction(payslip_id=payslip_id, category=data.category, amount=data.amount)
    db.add(deduction)
    await db.flush()
    await _recalc_net_pay(db, payslip)
    await db.commit()
    await db.refresh(deduction)
    return DeductionOut.model_validate(deduction)


@router.delete("/payslips/{payslip_id}/deductions/{deduction_id}", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def remove_deduction(payslip_id: int, deduction_id: int, db: AsyncSession = Depends(get_db)):
    payslip = await _get_payslip_or_404(db, payslip_id)
    if payslip.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit draft payslips")
    run = await _get_run_or_404(db, payslip.payroll_run_id)
    if run.status != "draft":
        raise HTTPException(status_code=400, detail="Can only edit payslips in draft runs")

    deduction = (await db.execute(
        select(PayslipDeduction).where(
            PayslipDeduction.id == deduction_id,
            PayslipDeduction.payslip_id == payslip_id,
        )
    )).scalar_one_or_none()
    if not deduction:
        raise HTTPException(status_code=404, detail="Deduction not found")

    await db.delete(deduction)
    await db.flush()
    await _recalc_net_pay(db, payslip)
    await db.commit()
    return {"detail": "Deduction removed"}


# ──────────────────── PDF EXPORT ────────────────────


@router.get("/payslips/{payslip_id}/pdf", dependencies=[Depends(require_roles(*_HR_ROLES))])
async def download_payslip_pdf(payslip_id: int, db: AsyncSession = Depends(get_db)):
    payslip = await _get_payslip_or_404(db, payslip_id)
    run = await _get_run_or_404(db, payslip.payroll_run_id)

    emp = (await db.execute(
        select(Employee).where(Employee.id == payslip.employee_id)
    )).scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    from app.utils.payslip_pdf import generate_payslip_pdf

    pdf_bytes = generate_payslip_pdf(
        payslip=payslip,
        employee=emp,
        run=run,
        allowances=list(payslip.allowances),
        deductions=list(payslip.deductions),
    )

    filename = f"payslip_{emp.employee_id or payslip.id}_{run.period}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
