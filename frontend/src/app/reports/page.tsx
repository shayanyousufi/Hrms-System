"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  reportsApi,
  AttendanceReport,
  LeaveReport,
  EmployeeReport,
  downloadFile,
} from "@/lib/reportsApi";
import { isAdminRole, isStaffRole } from "@/lib/auth";

const departments = ["Engineering", "Design", "HR", "Finance", "Marketing", "Sales"];

type Section = "attendance" | "leaves" | "employees";

export default function ReportsPage() {
  const [section, setSection] = useState<Section>("attendance");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);

  const [attendance, setAttendance] = useState<AttendanceReport | null>(null);
  const [leaves, setLeaves] = useState<LeaveReport | null>(null);
  const [employees, setEmployees] = useState<EmployeeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [leaveType, setLeaveType] = useState("");

  useEffect(() => {
    const role = localStorage.getItem("role");
    setIsAdmin(isAdminRole(role));
    setIsStaff(isStaffRole(role));
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (department) params.set("department", department);
    if (employeeFilter) params.set("employee", employeeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (leaveType) params.set("leave_type", leaveType);
    return params;
  }, [dateFrom, dateTo, department, employeeFilter, statusFilter, leaveType]);

  const load = useCallback(async (s: Section) => {
    setLoading(true);
    setError("");
    try {
      const params = buildParams();
      if (s === "attendance") setAttendance(await reportsApi.attendance(params));
      if (s === "leaves") setLeaves(await reportsApi.leaves(params));
      if (s === "employees") setEmployees(await reportsApi.employees(params));
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    load(section);
  }, [section, load]);

  const onExportCsv = () => {
    const params = buildParams().toString();
    if (section === "attendance") downloadFile(`/employees/export/attendance.csv${params ? `?${params}` : ""}`, "attendance.csv");
    if (section === "leaves") downloadFile(`/employees/export/leaves.csv${params ? `?${params}` : ""}`, "leaves.csv");
    if (section === "employees") downloadFile(`/employees/export/employees.csv${params ? `?${params}` : ""}`, "employees.csv");
  };

  const onExportPdf = () => {
    const params = buildParams().toString();
    const target = `/reports/${section}/export.pdf${params ? `?${params}` : ""}`;
    downloadFile(target, `${section}-report.pdf`);
  };

  const scopeBadge =
    employees?.filters.scope ||
    attendance?.filters.scope ||
    leaves?.filters.scope ||
    "";

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Attendance, leave and employee reports with live data
              {scopeBadge && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 text-primary-600">
                  scope: {scopeBadge}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            {isStaff && (
              <>
                <button onClick={onExportCsv} className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all border border-gray-200 hover:border-gray-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Export CSV
                </button>
                <button onClick={onExportPdf} className="inline-flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all border border-red-100">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2zm3-4h4m-4-4h4" /></svg>
                  Export PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <select value={section} onChange={(e) => setSection(e.target.value as Section)} className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all text-gray-600 min-w-[170px]">
              <option value="attendance">Attendance</option>
              <option value="leaves">Leave</option>
              <option value="employees">Employees</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600" />
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600 min-w-[150px]">
              <option value="">All Departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} placeholder="Employee ID (e.g. EMP-1002)" className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600 min-w-[180px]" />
            {section === "attendance" && (
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600 min-w-[130px]">
                <option value="">All Status</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
              </select>
            )}
            {section === "leaves" && (
              <>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600 min-w-[130px]">
                  <option value="">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
                <input value={leaveType} onChange={(e) => setLeaveType(e.target.value)} placeholder="Leave type" className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600 min-w-[120px]" />
              </>
            )}
            {section === "employees" && (
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600 min-w-[130px]">
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Inactive">Inactive</option>
              </select>
            )}
          </div>
          {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div></div>
          ) : section === "attendance" && attendance ? (
            <AttendanceView report={attendance} />
          ) : section === "leaves" && leaves ? (
            <LeavesView report={leaves} />
          ) : section === "employees" && employees ? (
            <EmployeesView report={employees} />
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ------------------------------------------------------------------ */

function SummaryCards({ items }: { items: { label: string; value: string | number; color?: string }[] }) {
  const colors: Record<string, string> = {
    primary: "text-primary-600",
    green: "text-green-600",
    red: "text-red-500",
    yellow: "text-amber-500",
    gray: "text-gray-700",
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-5 border-b border-gray-100">
      {items.map((it) => (
        <div key={it.label} className="bg-gray-50 rounded-xl p-3">
          <p className="text-[11px] font-medium text-gray-400">{it.label}</p>
          <p className={`text-xl font-bold mt-1 ${colors[it.color || "primary"]}`}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/80">
            {headers.map((h) => (
              <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-primary-50/30 transition-colors">
              {r.map((c, j) => (
                <td key={j} className="px-5 py-3 text-sm text-gray-600">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <div className="py-16 text-center text-sm text-gray-400">No records match the selected filters</div>;
}

function AttendanceView({ report }: { report: AttendanceReport }) {
  const rows = report.rows.map((r) => [
    `${r.first_name} ${r.last_name}`, r.employee_id, r.department || "—", r.designation || "—",
    r.total_days, r.present, r.late, r.absent, r.leave, `${r.attendance_percentage}%`,
  ]);
  return (
    <>
      <SummaryCards items={[
        { label: "Total Records", value: report.total_records },
        { label: "Present", value: report.present, color: "green" },
        { label: "Late", value: report.late, color: "yellow" },
        { label: "Absent", value: report.absent, color: "red" },
        { label: "Leave", value: report.leave },
        { label: "Attendance", value: `${report.attendance_percentage}%` },
      ]} />
      {report.rows.length ? (
        <Table headers={["Employee", "ID", "Department", "Designation", "Days", "Present", "Late", "Absent", "Leave", "Rate %"]} rows={rows} />
      ) : <Empty />}
    </>
  );
}

function LeavesView({ report }: { report: LeaveReport }) {
  const rows = report.rows.map((r) => [
    `${r.first_name} ${r.last_name}`, r.employee_id, r.department || "—", r.leave_type || "—",
    r.total_requests, r.approved, r.pending, r.rejected, r.days_taken,
  ]);
  return (
    <>
      <SummaryCards items={[
        { label: "Total Requests", value: report.total_requests },
        { label: "Approved", value: report.approved, color: "green" },
        { label: "Pending", value: report.pending, color: "yellow" },
        { label: "Rejected", value: report.rejected, color: "red" },
        { label: "Days Taken", value: report.days_taken },
      ]} />
      {report.rows.length ? (
        <Table headers={["Employee", "ID", "Department", "Type", "Requests", "Approved", "Pending", "Rejected", "Days"]} rows={rows} />
      ) : <Empty />}
    </>
  );
}

function EmployeesView({ report }: { report: EmployeeReport }) {
  const headers = ["Employee", "ID", "Email", "Department", "Designation", "Status", "Joining"];
  if (report.includes_salary) headers.push("Salary");
  const rows = report.rows.map((r) => {
    const base = [
      `${r.first_name} ${r.last_name}`, r.employee_id, r.email, r.department, r.designation,
      r.employment_status, new Date(r.joining_date).toLocaleDateString(),
    ];
    if (report.includes_salary) base.push(r.salary != null ? `$${Number(r.salary).toLocaleString()}` : "—");
    return base;
  });
  return (
    <>
      <SummaryCards items={[
        { label: "Total Employees", value: report.total },
        { label: "Scope", value: report.filters.scope },
        { label: "Includes Salary", value: report.includes_salary ? "Yes" : "No", color: report.includes_salary ? "green" : "gray" },
      ]} />
      {report.rows.length ? <Table headers={headers} rows={rows} /> : <Empty />}
    </>
  );
}