from pydantic import BaseModel, field_validator
from typing import Optional
from decimal import Decimal

ALLOWANCE_CATEGORIES = {"transport", "medical", "housing", "other"}
DEDUCTION_CATEGORIES = {"eobi", "loan", "advance", "other"}
PAYROLL_STATUSES = {"draft", "finalized", "paid"}


class AllowanceIn(BaseModel):
    category: str
    amount: Decimal

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ALLOWANCE_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(sorted(ALLOWANCE_CATEGORIES))}")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("amount must be >= 0")
        return v


class DeductionIn(BaseModel):
    category: str
    amount: Decimal

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in DEDUCTION_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(sorted(DEDUCTION_CATEGORIES))}")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("amount must be >= 0")
        return v


class AllowanceOut(BaseModel):
    id: int
    category: str
    amount: Decimal

    class Config:
        from_attributes = True


class DeductionOut(BaseModel):
    id: int
    category: str
    amount: Decimal

    class Config:
        from_attributes = True


class PayslipOut(BaseModel):
    id: int
    payroll_run_id: int
    employee_id: int
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    base_salary: Decimal
    net_pay: Decimal
    status: str
    allowances: list[AllowanceOut] = []
    deductions: list[DeductionOut] = []
    total_allowances: Decimal = Decimal("0")
    total_deductions: Decimal = Decimal("0")
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


class PayslipCreate(BaseModel):
    employee_id: int

    @field_validator("employee_id")
    @classmethod
    def validate_employee_id(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("employee_id must be positive")
        return v


class PayrollRunOut(BaseModel):
    id: int
    period: str
    status: str
    created_by: int
    creator_email: Optional[str] = None
    payslip_count: int = 0
    total_net_pay: Decimal = Decimal("0")
    created_at: Optional[str] = None
    payslips: list[PayslipOut] = []

    class Config:
        from_attributes = True


class PayrollRunCreate(BaseModel):
    period: str

    @field_validator("period")
    @classmethod
    def validate_period(cls, v: str) -> str:
        import re
        v = v.strip()
        if not re.match(r"^\d{4}-\d{2}$", v):
            raise ValueError("period must be YYYY-MM format")
        return v


class BulkPayslipCreate(BaseModel):
    employee_ids: list[int]

    @field_validator("employee_ids")
    @classmethod
    def validate_ids(cls, v: list[int]) -> list[int]:
        if not v:
            raise ValueError("employee_ids cannot be empty")
        for eid in v:
            if eid <= 0:
                raise ValueError("all employee_ids must be positive")
        return v
