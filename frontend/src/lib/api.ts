import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api",
  headers: { "Content-Type": "application/json" },
});

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  phone?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    email: string;
    phone: string | null;
  };
}

export interface ForgotPasswordResponse {
  message: string;
  code?: string;
  email_sent?: boolean;
  email_error?: string;
}

export const authApi = {
  login: (data: LoginPayload) => api.post<AuthResponse>("/auth/login", data),
  register: (data: RegisterPayload) => api.post<AuthResponse>("/auth/register", data),
  forgotPassword: (email: string) => api.post<ForgotPasswordResponse>("/auth/forgot-password", { email }),
  resetPassword: (code: string, newPassword: string) =>
    api.post("/auth/reset-password", { code, new_password: newPassword }),
  getMe: (token: string) =>
    api.get<AuthResponse["user"]>("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
};
