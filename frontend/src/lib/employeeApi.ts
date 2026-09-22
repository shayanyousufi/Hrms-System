import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (typeof window !== "undefined" && error.response?.status === 401) {
      localStorage.removeItem("token");
      document.cookie = "token=; path=/; max-age=0";
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export interface Employee {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  cnic: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  profile_picture: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  department: string;
  designation: string;
  reporting_manager: string | null;
  joining_date: string;
  employment_status: string;
  salary: number | null;
  bank_account: string | null;
  leave_balance: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EmployeeListItem {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  department: string;
  designation: string;
  employment_status: string;
  joining_date: string;
  profile_picture: string | null;
}

export interface PaginatedResponse {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  employees: EmployeeListItem[];
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

export interface PaginatedAttendance {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  records: AttendanceRecord[];
}

export interface LeaveRecord {
  id: number;
  employee_id: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  first_name?: string | null;
  last_name?: string | null;
  employee_code?: string | null;
  leave_balance?: number | null;
}

export interface PaginatedLeaves {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  records: LeaveRecord[];
}

export interface DocumentRecord {
  id: number;
  employee_id: number;
  name: string;
  doc_type: string;
  has_file: boolean;
  content_type: string | null;
  file_size: number | null;
  uploaded_at: string | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
}

export interface ActivityRecord {
  id: number;
  employee_id: number;
  action: string;
  performed_by: string | null;
  timestamp: string | null;
}

export interface PaginatedActivities {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  records: ActivityRecord[];
}

export interface TaskRecord {
  id: number;
  title: string;
  tag: string;
  tag_color: string;
  status: string;
  created_at: string | null;
}

export interface PaginatedTasks {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  records: TaskRecord[];
}

export interface MeetingRecord {
  id: number;
  title: string;
  description: string | null;
  meeting_time: string;
  location: string | null;
  meeting_date: string;
  created_at: string | null;
}

export interface PaginatedMeetings {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  records: MeetingRecord[];
}

export interface DashboardStats {
  total_employees: number;
  active: number;
  on_leave: number;
  inactive: number;
  pending_leaves: number;
  departments: { name: string; count: number }[];
  attendance_today: { present: number; absent: number; leave: number; late: number };
}

export interface AttendanceRecordWithEmployee {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_department: string | null;
  designation: string | null;
  profile_picture: string | null;
}

export interface PaginatedAttendanceRecords {
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  records: AttendanceRecordWithEmployee[];
}

export interface AttendanceStats {
  present: number;
  absent: number;
  leave: number;
  late: number;
  total: number;
  attendance_rate: number;
}

export interface TodayAttendanceItem {
  employee_id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  designation: string | null;
  profile_picture: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
}

export interface ActivityFeedItem {
  id: number;
  action: string;
  performed_by: string | null;
  timestamp: string | null;
  employee_id: string | null;
  department: string | null;
}

export const employeesApi = {
  stats: () =>
    api.get<DashboardStats>("/employees/stats/overview").then((r) => r.data),

  list: (params: URLSearchParams) =>
    api.get<PaginatedResponse>(`/employees?${params.toString()}`).then((r) => r.data),

  get: (employeeId: string) =>
    api.get<Employee>(`/employees/${employeeId}`).then((r) => r.data),

  create: (data: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    cnic?: string;
    date_of_birth?: string;
    gender?: string;
    address?: string;
    department: string;
    designation: string;
    reporting_manager?: string;
    joining_date: string;
    employment_status?: string;
    salary?: number;
    bank_account?: string;
  }) => api.post<Employee>("/employees", data).then((r) => r.data),

  update: (employeeId: string, data: Record<string, any>) =>
    api.put<Employee>(`/employees/${employeeId}`, data).then((r) => r.data),

  delete: (employeeId: string, hard = false) =>
    api.delete(`/employees/${employeeId}${hard ? "?hard=true" : ""}`).then((r) => r.data),

  checkIn: (employeeId: number) =>
    api.post(`/employees/attendance/checkin?employee_id=${employeeId}`).then((r) => r.data),

  checkOut: (employeeId: number) =>
    api.post(`/employees/attendance/checkout?employee_id=${employeeId}`).then((r) => r.data),

  getTodayAttendance: (employeeId: number) =>
    api.get(`/employees/attendance/today/${employeeId}`).then((r) => r.data),

  createLeave: (data: { employee_id: number; leave_type: string; start_date: string; end_date: string; reason?: string }) =>
    api.post("/employees/leaves", data).then((r) => r.data),

  updateLeave: (leaveId: number, data: { status: string }) =>
    api.put(`/employees/leaves/${leaveId}`, data).then((r) => r.data),

  getAllLeaves: (params: URLSearchParams) =>
    api.get<PaginatedLeaves>(`/employees/leaves/all?${params.toString()}`).then((r) => r.data),

  uploadProfilePicture: (employeeId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.put(`/employees/${employeeId}/profile-picture`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },

  getAttendance: (employeeId: string, params: URLSearchParams) =>
    api.get<PaginatedAttendance>(`/employees/${employeeId}/attendance?${params.toString()}`).then((r) => r.data),

  getLeaves: (employeeId: string, params: URLSearchParams) =>
    api.get<PaginatedLeaves>(`/employees/${employeeId}/leaves?${params.toString()}`).then((r) => r.data),

  getDocuments: (employeeId: string) =>
    api.get<DocumentRecord[]>(`/employees/${employeeId}/documents`).then((r) => r.data),

  uploadDocument: (employeeId: string, file: File, docType = "General") => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post<DocumentRecord>(`/employees/${employeeId}/documents?doc_type=${encodeURIComponent(docType)}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },

  deleteDocument: (employeeId: string, documentId: number) =>
    api.delete(`/employees/${employeeId}/documents/${documentId}`).then((r) => r.data),

  getActivities: (employeeId: string, params: URLSearchParams) =>
    api.get<PaginatedActivities>(`/employees/${employeeId}/activities?${params.toString()}`).then((r) => r.data),

  getTasks: (params: URLSearchParams) =>
    api.get<PaginatedTasks>(`/employees/dashboard/tasks?${params.toString()}`).then((r) => r.data),

  getMeetings: (params: URLSearchParams) =>
    api.get<PaginatedMeetings>(`/employees/dashboard/meetings?${params.toString()}`).then((r) => r.data),

  getAttendanceStats: (date?: string) =>
    api.get<AttendanceStats>(`/attendance/stats${date ? `?date=${date}` : ""}`).then((r) => r.data),

  getAttendanceRecords: (params: URLSearchParams) =>
    api.get<PaginatedAttendanceRecords>(`/attendance/records?${params.toString()}`).then((r) => r.data),

  getAllTodayAttendance: () =>
    api.get<TodayAttendanceItem[]>("/attendance/today").then((r) => r.data),

  getMyAttendanceStatus: () =>
    api.get<{
      linked: boolean;
      id: number | null;
      employee_id: string | null;
      full_name: string | null;
      checked_in: boolean;
      checked_out: boolean;
      check_in: string | null;
      check_out: string | null;
    }>("/attendance/my-status").then((r) => r.data),

  attendanceCheckIn: (employeeId: string) =>
    api.post("/attendance/checkin", { employee_id: employeeId }).then((r) => r.data),

  attendanceCheckOut: (employeeId: string) =>
    api.post("/attendance/checkout", { employee_id: employeeId }).then((r) => r.data),

  getActivityFeed: (limit = 10) =>
    api.get<ActivityFeedItem[]>(`/attendance/activity-feed?limit=${limit}`).then((r) => r.data),
};

export function downloadCsv(path: string, fallbackFilename: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const url = `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api"}${path}`;
  fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then((res) => {
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      return res.blob();
    })
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fallbackFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    });
}
