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

export type UserRole = "SUPER_ADMIN" | "HR" | "MANAGER" | "EMPLOYEE";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  phone?: string;
}

export interface AuthUser {
  id: number;
  email: string;
  phone: string | null;
  role: UserRole;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordPayload {
  email: string;
  token: string;
  new_password: string;
}

export const authApi = {
  login: (data: LoginPayload) => api.post<AuthResponse>("/auth/login", data),
  register: (data: RegisterPayload) => api.post<AuthResponse>("/auth/register", data),
  forgotPassword: (email: string) =>
    api.post<ForgotPasswordResponse>("/auth/forgot-password", { email }),
  resetPassword: (email: string, token: string, newPassword: string) =>
    api.post<{ message: string }>("/auth/reset-password", {
      email,
      token,
      new_password: newPassword,
    } as ResetPasswordPayload),
  getMe: (token: string) =>
    api.get<AuthResponse["user"]>("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  listUsers: () => api.get<AuthUser[]>("/auth/users"),
  updateRole: (userId: number, role: UserRole) =>
    api.patch<AuthUser>(`/auth/users/${userId}/role`, { role }),
  linkEmployee: (userId: number, employeeId: number) =>
    api.post<AuthUser>(`/auth/users/${userId}/link-employee`, { employee_id: employeeId }),
};
