from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime


class EmployeeBase(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    cnic: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    profile_picture: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    department: str
    designation: str
    reporting_manager: Optional[str] = None
    joining_date: date
    employment_status: Optional[str] = "Active"
    salary: Optional[float] = None
    bank_account: Optional[str] = None
    leave_balance: Optional[int] = 15


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    cnic: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    profile_picture: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relation: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    reporting_manager: Optional[str] = None
    employment_status: Optional[str] = None
    salary: Optional[float] = None
    bank_account: Optional[str] = None


class EmployeeResponse(EmployeeBase):
    id: int
    employee_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmployeeListResponse(BaseModel):
    id: int
    employee_id: str
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    department: str
    designation: str
    employment_status: str
    joining_date: date
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True


class AttendanceResponse(BaseModel):
    id: int
    employee_id: int
    date: date
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class LeaveResponse(BaseModel):
    id: int
    employee_id: int
    leave_type: str
    start_date: date
    end_date: date
    status: str
    reason: Optional[str] = None

    class Config:
        from_attributes = True


class LeaveResponseWithEmployee(BaseModel):
    id: int
    employee_id: int
    leave_type: str
    start_date: date
    end_date: date
    status: str
    reason: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    employee_code: Optional[str] = None
    leave_balance: Optional[int] = None


class DocumentResponse(BaseModel):
    id: int
    employee_id: int
    name: str
    doc_type: str
    has_file: bool = False
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_at: Optional[datetime] = None
    uploaded_by: Optional[int] = None
    uploaded_by_name: Optional[str] = None


class ActivityLogResponse(BaseModel):
    id: int
    employee_id: int
    action: str
    performed_by: Optional[str] = None
    timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True


class PaginatedEmployees(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    employees: List[EmployeeListResponse]


class PaginatedAttendance(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    records: List[AttendanceResponse]


class PaginatedLeaves(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    records: List[LeaveResponseWithEmployee]


class PaginatedActivities(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    records: List[ActivityLogResponse]


class PaginatedTasks(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    records: List[TaskResponse]


class PaginatedMeetings(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    records: List[MeetingResponse]


class LeaveCreate(BaseModel):
    employee_id: int
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None


class LeaveUpdate(BaseModel):
    status: str


class TaskResponse(BaseModel):
    id: int
    title: str
    tag: str
    tag_color: str
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MeetingResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    meeting_time: str
    location: Optional[str] = None
    meeting_date: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AttendanceRecordWithEmployee(BaseModel):
    id: int
    date: date
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str
    employee_id: str
    first_name: str
    last_name: str
    employee_department: Optional[str] = None
    designation: Optional[str] = None
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True


class PaginatedAttendanceRecords(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    records: List[AttendanceRecordWithEmployee]


class AttendanceStats(BaseModel):
    present: int
    absent: int
    leave: int
    late: int
    total: int
    attendance_rate: float


class TodayAttendanceItem(BaseModel):
    employee_id: str
    first_name: str
    last_name: str
    department: Optional[str] = None
    designation: Optional[str] = None
    profile_picture: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str


class ActivityFeedItem(BaseModel):
    id: int
    action: str
    performed_by: Optional[str] = None
    timestamp: Optional[datetime] = None
    employee_id: Optional[str] = None
    department: Optional[str] = None
