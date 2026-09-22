"""Response schemas for HR reports (attendance, leave, employees)."""
from typing import List, Optional
from datetime import date
from pydantic import BaseModel


class ReportFilters(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    employee: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None
    leave_type: Optional[str] = None
    scope: str


class AttendanceReportRow(BaseModel):
    employee_id: str
    first_name: str
    last_name: str
    department: Optional[str] = None
    designation: Optional[str] = None
    total_days: int
    present: int
    late: int
    absent: int
    leave: int
    attendance_percentage: float


class AttendanceReportResponse(BaseModel):
    filters: ReportFilters
    total_records: int
    present: int
    late: int
    absent: int
    leave: int
    attendance_percentage: float
    rows: List[AttendanceReportRow]


class LeaveReportRow(BaseModel):
    employee_id: str
    first_name: str
    last_name: str
    department: Optional[str] = None
    leave_type: Optional[str] = None
    total_requests: int
    approved: int
    pending: int
    rejected: int
    days_taken: int


class LeaveReportResponse(BaseModel):
    filters: ReportFilters
    total_requests: int
    approved: int
    pending: int
    rejected: int
    days_taken: int
    rows: List[LeaveReportRow]


class EmployeeReportRow(BaseModel):
    id: int
    employee_id: str
    first_name: str
    last_name: str
    email: str
    department: str
    designation: str
    employment_status: str
    joining_date: date
    salary: Optional[float] = None


class EmployeeReportResponse(BaseModel):
    filters: ReportFilters
    total: int
    includes_salary: bool
    rows: List[EmployeeReportRow]