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

export interface ImportRowResult {
  row: number;
  data: Record<string, string>;
  valid: boolean;
  errors: string[];
}

export interface ImportPreview {
  filename: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicates_in_file: { row: number; field: string; value: string }[];
  preview: ImportRowResult[];
}

export interface ImportConfirm {
  filename: string;
  total_rows: number;
  successful: number;
  failed: number;
  failures: { row: number; error: string }[];
}

export const importApi = {
  templateUrl: () => "/imports/template",

  preview: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post<ImportPreview>("/imports/preview", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },

  confirm: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post<ImportConfirm>("/imports/confirm", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
};