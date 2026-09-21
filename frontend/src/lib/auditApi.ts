import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface AuditLogEntry {
  id: number;
  action: string;
  target_user_id: number | null;
  target_email: string | null;
  performed_by: number | null;
  performer_email: string | null;
  old_value: string | null;
  new_value: string | null;
  ip_address: string | null;
  created_at: string | null;
}

export interface ActionType {
  action: string;
  count: number;
}

export const auditApi = {
  list: (params: URLSearchParams) =>
    api.get<AuditLogEntry[]>(`/audit-logs?${params.toString()}`).then((r) => r.data),
  actionTypes: () =>
    api.get<ActionType[]>("/audit-logs/actions").then((r) => r.data),
};
