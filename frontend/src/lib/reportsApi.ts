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

export interface ReportFilters {
  date_from?: string | null;
  date_to?: string | null;
  employee?: string | null;
  department?: string | null;
  status?: string | null;
  leave_type?: string | null;
  scope: string;
}

export interface AttendanceReportRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  designation: string | null;
  total_days: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  attendance_percentage: number;
}

export interface AttendanceReport {
  filters: ReportFilters;
  total_records: number;
  present: number;
  late: number;
  absent: number;
  leave: number;
  attendance_percentage: number;
  rows: AttendanceReportRow[];
}

export interface LeaveReportRow {
  employee_id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  leave_type: string | null;
  total_requests: number;
  approved: number;
  pending: number;
  rejected: number;
  days_taken: number;
}

export interface LeaveReport {
  filters: ReportFilters;
  total_requests: number;
  approved: number;
  pending: number;
  rejected: number;
  days_taken: number;
  rows: LeaveReportRow[];
}

export interface EmployeeReportRow {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  designation: string;
  employment_status: string;
  joining_date: string;
  salary: number | null;
}

export interface EmployeeReport {
  filters: ReportFilters;
  total: number;
  includes_salary: boolean;
  rows: EmployeeReportRow[];
}

export const reportsApi = {
  attendance: (params: URLSearchParams) =>
    api.get<AttendanceReport>(`/reports/attendance?${params.toString()}`).then((r) => r.data),

  leaves: (params: URLSearchParams) =>
    api.get<LeaveReport>(`/reports/leaves?${params.toString()}`).then((r) => r.data),

  employees: (params: URLSearchParams) =>
    api.get<EmployeeReport>(`/reports/employees?${params.toString()}`).then((r) => r.data),
};

/** Download an authenticated file (CSV/PDF) and save it. */
export function downloadFile(path: string, fallbackFilename: string) {
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