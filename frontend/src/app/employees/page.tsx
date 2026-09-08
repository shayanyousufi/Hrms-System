"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { employeesApi, PaginatedResponse, downloadCsv } from "@/lib/employeeApi";
import { importApi, ImportPreview, ImportConfirm } from "@/lib/importApi";
import { canManageEmployees } from "@/lib/auth";

const departments = ["Engineering", "Design", "HR", "Finance", "Marketing", "Sales"];
const statuses = ["Active", "On Leave", "Inactive"];

const statusColors: Record<string, string> = {
  Active: "bg-green-50 text-green-600",
  "On Leave": "bg-yellow-50 text-yellow-600",
  Inactive: "bg-red-50 text-red-500",
};

const departmentColors: Record<string, string> = {
  Engineering: "bg-primary-50 text-primary-600",
  Design: "bg-pink-50 text-pink-600",
  HR: "bg-blue-50 text-blue-600",
  Finance: "bg-emerald-50 text-emerald-600",
  Marketing: "bg-orange-50 text-orange-600",
  Sales: "bg-cyan-50 text-cyan-600",
};

export default function EmployeesPage() {
  return (
    <Suspense>
      <EmployeesContent />
    </Suspense>
  );
}

function EmployeesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAdmin, setIsAdmin] = useState(false);
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importResult, setImportResult] = useState<ImportConfirm | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const perPage = 10;

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
        search,
        department,
        status,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const result = await employeesApi.list(params);
      setData(result);
    } catch (err) {
      console.error("Failed to fetch employees", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, department, status, sortBy, sortOrder, dateFrom, dateTo]);

  useEffect(() => {
    const role = localStorage.getItem("role");
    setIsAdmin(canManageEmployees(role));
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    setPage(1);
  }, [search, department, status, dateFrom, dateTo]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <svg className="w-3 h-3 text-gray-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return <svg className={`w-3 h-3 ml-1 text-primary-500`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={sortOrder === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} /></svg>;
  };

  const getInitials = (first: string, last: string) => `${first[0]}${last[0]}`.toUpperCase();

  const activeFilters = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const handleImportFile = (file: File) => {
    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setImportError("");
  };

  const runPreview = async () => {
    if (!importFile) return;
    setImportBusy(true);
    setImportError("");
    try {
      const p = await importApi.preview(importFile);
      setImportPreview(p);
    } catch (e: any) {
      setImportError(e?.response?.data?.detail || "Failed to read file");
    } finally {
      setImportBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!importFile) return;
    if (importPreview && importPreview.valid_rows === 0) {
      setImportError("No valid rows to import. Fix the errors and try again.");
      return;
    }
    setImportBusy(true);
    setImportError("");
    try {
      const c = await importApi.confirm(importFile);
      setImportResult(c);
      if (c.successful > 0) fetchEmployees();
    } catch (e: any) {
      setImportError(e?.response?.data?.detail || "Import failed");
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage your team members and their information</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            {isAdmin && (
              <>
                <button onClick={() => downloadCsv("/employees/export/employees.csv", "employees.csv")} className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all border border-gray-200 hover:border-gray-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Export CSV
                </button>
                <button onClick={() => { setShowImportModal(true); setImportFile(null); setImportPreview(null); setImportResult(null); setImportError(""); }} className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all border border-gray-200 hover:border-gray-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Import
                </button>
                <Link href="/employees/new" className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-primary-200 hover:shadow-lg hover:shadow-primary-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add Employee
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Stats */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Employees" value={data.total} color="primary" />
            <StatCard label="Active" value={data.employees.filter((e) => e.employment_status === "Active").length} color="green" />
            <StatCard label="On Leave" value={data.employees.filter((e) => e.employment_status === "On Leave").length} color="yellow" />
            <StatCard label="Inactive" value={data.employees.filter((e) => e.employment_status === "Inactive").length} color="red" />
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* Main Row */}
          <div className="flex flex-col sm:flex-row items-stretch gap-3 p-4">
            <div className="flex-1 relative">
              <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                placeholder="Search by name, email, or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all text-gray-600 min-w-[150px]"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all text-gray-600 min-w-[130px]"
            >
              <option value="">All Status</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${showFilters || activeFilters ? "bg-primary-50 border-primary-200 text-primary-600" : "bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100"}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filters
              {activeFilters > 0 && (
                <span className="w-5 h-5 bg-primary-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{activeFilters}</span>
              )}
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="px-4 pb-4 pt-0 border-t border-gray-50">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-3">
                <span className="text-xs font-medium text-gray-400 flex-shrink-0">Joining Date Range:</span>
                <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600" />
                <span className="text-gray-300 text-xs flex-shrink-0">to</span>
                <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600" />
                {activeFilters > 0 && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }} className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 ml-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    Clear dates
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
              <p className="text-sm text-gray-400">Loading employees...</p>
            </div>
          ) : data && data.employees.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider group">
                        <button onClick={() => handleSort("first_name")} className="flex items-center hover:text-gray-600 transition-colors">
                          Employee <SortIcon field="first_name" />
                        </button>
                      </th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider group">
                        <button onClick={() => handleSort("department")} className="flex items-center hover:text-gray-600 transition-colors">
                          Department <SortIcon field="department" />
                        </button>
                      </th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider group hidden md:table-cell">
                        <button onClick={() => handleSort("designation")} className="flex items-center hover:text-gray-600 transition-colors">
                          Designation <SortIcon field="designation" />
                        </button>
                      </th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                        Email
                      </th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider group">
                        <button onClick={() => handleSort("employment_status")} className="flex items-center hover:text-gray-600 transition-colors">
                          Status <SortIcon field="employment_status" />
                        </button>
                      </th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider group hidden xl:table-cell">
                        <button onClick={() => handleSort("joining_date")} className="flex items-center hover:text-gray-600 transition-colors">
                          Joined <SortIcon field="joining_date" />
                        </button>
                      </th>
                      <th className="text-center px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.employees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="hover:bg-primary-50/30 transition-colors cursor-pointer group"
                        onClick={() => router.push(`/employees/${emp.employee_id}`)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {emp.profile_picture ? (
                              <img src={emp.profile_picture} alt={`${emp.first_name} ${emp.last_name}`} className="w-10 h-10 rounded-full object-cover ring-2 ring-white" />
                            ) : (
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${departmentColors[emp.department] || "bg-primary-100 text-primary-700"}`}>
                                {getInitials(emp.first_name, emp.last_name)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary-600 transition-colors">{emp.first_name} {emp.last_name}</p>
                              <p className="text-[11px] text-gray-400 font-mono">{emp.employee_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${departmentColors[emp.department] || "bg-gray-50 text-gray-500"}`}>
                            {emp.department}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 hidden md:table-cell">{emp.designation}</td>
                        <td className="px-5 py-3.5 text-sm text-gray-400 hidden lg:table-cell truncate max-w-[200px]">{emp.email}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${statusColors[emp.employment_status] || "bg-gray-50 text-gray-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.employment_status === "Active" ? "bg-green-500" : emp.employment_status === "On Leave" ? "bg-yellow-500" : "bg-red-400"}`}></span>
                            {emp.employment_status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-400 hidden xl:table-cell">
                          {new Date(emp.joining_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/employees/${emp.employee_id}`); }}
                            className="text-primary-500 hover:text-primary-700 text-xs font-semibold bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-all"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-gray-100 gap-3">
                <p className="text-xs text-gray-400">
                  Showing <span className="font-semibold text-gray-600">{(data.page - 1) * data.per_page + 1}</span> to <span className="font-semibold text-gray-600">{Math.min(data.page * data.per_page, data.total)}</span> of <span className="font-semibold text-gray-600">{data.total}</span> employees
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-500"
                  >
                    Prev
                  </button>
                  {Array.from({ length: Math.min(data.total_pages, 5) }, (_, i) => {
                    let p: number;
                    if (data.total_pages <= 5) {
                      p = i + 1;
                    } else if (page <= 3) {
                      p = i + 1;
                    } else if (page >= data.total_pages - 2) {
                      p = data.total_pages - 4 + i;
                    } else {
                      p = page - 2 + i;
                    }
                    return p;
                  }).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                        p === page
                          ? "bg-primary-500 text-white shadow-sm shadow-primary-200"
                          : "text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage(Math.min(data.total_pages, page + 1))}
                    disabled={page === data.total_pages}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-500"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 11-3-3 3 3 0 013 3z" /></svg>
              </div>
              <p className="text-sm font-semibold text-gray-500">No employees found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Import Employees</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="text-sm text-gray-500 mb-4">
              Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file with employee data.
              Required columns: <code className="bg-gray-100 px-1 rounded">email, first_name, last_name, department, designation, joining_date</code>.
              Duplicates and invalid rows are skipped and reported.
              <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api"}${importApi.templateUrl()}`}
                download className="block mt-2 text-primary-600 hover:text-primary-700 font-semibold inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download template
              </a>
            </div>

            <label className="block">
              <span className="block text-xs font-medium text-gray-500 mb-1">Select file</span>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              />
            </label>

            {importError && <p className="mt-3 text-xs text-red-500">{importError}</p>}

            {importFile && !importPreview && !importResult && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <span className="text-xs text-gray-400 font-mono">{importFile.name}</span>
                <button onClick={runPreview} disabled={importBusy} className="px-4 py-2 text-sm font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-xl transition-colors disabled:opacity-50">
                  {importBusy ? "Parsing..." : "Preview"}
                </button>
              </div>
            )}

            {importPreview && !importResult && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary-50 text-primary-600 font-semibold">Valid: {importPreview.valid_rows}</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-semibold">Invalid: {importPreview.invalid_rows}</span>
                </div>
                {importPreview.duplicates_in_file.length > 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    {importPreview.duplicates_in_file.length} duplicate row(s) detected within the file.
                  </p>
                )}
                <div className="mt-3 max-h-48 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                  {importPreview.preview.slice(0, 100).map((r) => (
                    <div key={r.row} className="px-3 py-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">Row {r.row}</p>
                        <p className="text-xs text-gray-700 truncate">
                          {(r.data.first_name || "")} {(r.data.last_name || "")} <span className="text-gray-400">&middot;</span>{' '}
                          <span className="font-mono">{r.data.email || ""}</span>
                        </p>
                      </div>
                      <span className={`flex-shrink-0 text-[10px] font-bold mt-0.5 ${r.valid ? "text-green-600" : "text-red-500"}`}>
                        {r.valid ? "OK" : r.errors.join("; ")}
                      </span>
                    </div>
                  ))}
                  {importPreview.preview.length > 100 && (
                    <p className="px-3 py-2 text-[11px] text-gray-400">Showing first 100 of {importPreview.preview.length} rows...</p>
                  )}
                </div>
                <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                  <button onClick={() => { setImportPreview(null); setImportFile(null); }} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                    Choose different file
                  </button>
                  <button onClick={runConfirm} disabled={importBusy} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50">
                    {importBusy ? "Importing..." : "Confirm Import"}
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-50 text-green-600 font-semibold">Imported: {importResult.successful}</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-red-50 text-red-600 font-semibold">Failed: {importResult.failed}</span>
                </div>
                {importResult.failures.length > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                    {importResult.failures.map((f) => (
                      <div key={f.row} className="px-3 py-2 text-xs text-gray-500">
                        Row {f.row}: <span className="text-red-500">{f.error}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowImportModal(false)} className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 transition-colors">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    primary: "from-primary-500 to-primary-600 shadow-primary-200",
    green: "from-green-500 to-emerald-600 shadow-green-200",
    yellow: "from-yellow-400 to-amber-500 shadow-yellow-200",
    red: "from-red-400 to-rose-500 shadow-red-200",
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-2xl p-4 text-white shadow-lg`}>
      <p className="text-[11px] font-medium text-white/70">{label}</p>
      <p className="text-2xl font-bold mt-1 leading-none">{value}</p>
    </div>
  );
}
