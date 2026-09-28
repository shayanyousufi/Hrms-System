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

export interface PayrollRun {
  id: number;
  period: string;
  status: string;
  created_by: number;
  creator_email?: string;
  payslip_count: number;
  total_net_pay: string;
  created_at?: string;
  payslips?: Payslip[];
}

export interface Payslip {
  id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  base_salary: string;
  net_pay: string;
  status: string;
  allowances: LineItem[];
  deductions: LineItem[];
  total_allowances: string;
  total_deductions: string;
  created_at?: string;
}

export interface LineItem {
  id: number;
  category: string;
  amount: string;
}

export const payrollApi = {
  listRuns: () => api.get<PayrollRun[]>("/payroll/runs"),
  createRun: (period: string) => api.post<PayrollRun>("/payroll/runs", { period }),
  getRun: (runId: number) => api.get<PayrollRun>(`/payroll/runs/${runId}`),
  updateRunStatus: (runId: number, status: string) =>
    api.patch(`/payroll/runs/${runId}`, { status }),
  deleteRun: (runId: number) => api.delete(`/payroll/runs/${runId}`),

  addPayslip: (runId: number, employeeId: number) =>
    api.post(`/payroll/runs/${runId}/payslips`, { employee_id: employeeId }),
  addPayslipsBulk: (runId: number, employeeIds: number[]) =>
    api.post(`/payroll/runs/${runId}/payslips/bulk`, { employee_ids: employeeIds }),
  removePayslip: (runId: number, payslipId: number) =>
    api.delete(`/payroll/runs/${runId}/payslips/${payslipId}`),

  addAllowance: (payslipId: number, category: string, amount: number) =>
    api.post(`/payroll/payslips/${payslipId}/allowances`, { category, amount }),
  removeAllowance: (payslipId: number, allowanceId: number) =>
    api.delete(`/payroll/payslips/${payslipId}/allowances/${allowanceId}`),

  addDeduction: (payslipId: number, category: string, amount: number) =>
    api.post(`/payroll/payslips/${payslipId}/deductions`, { category, amount }),
  removeDeduction: (payslipId: number, deductionId: number) =>
    api.delete(`/payroll/payslips/${payslipId}/deductions/${deductionId}`),

  downloadPdf: async (payslipId: number, filename: string) => {
    const res = await api.get(`/payroll/payslips/${payslipId}/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
