"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  employeesApi,
  PaginatedAttendanceRecords,
  AttendanceStats,
  downloadCsv,
} from "@/lib/employeeApi";

const departments = ["Engineering", "Design", "HR", "Finance", "Marketing", "Sales"];
const statuses = ["Present", "Absent", "On Leave", "Late"];

const statusStyles: Record<string, string> = {
  Present: "bg-green-50 text-green-600 ring-green-100",
  Absent: "bg-red-50 text-red-500 ring-red-100",
  "On Leave": "bg-yellow-50 text-yellow-600 ring-yellow-100",
  Late: "bg-orange-50 text-orange-600 ring-orange-100",
};

const statusDot: Record<string, string> = {
  Present: "bg-green-500",
  Absent: "bg-red-400",
  "On Leave": "bg-yellow-500",
  Late: "bg-orange-500",
};

export default function AttendancePage() {
  return (
    <Suspense>
      <AttendanceContent />
    </Suspense>
  );
}

function AttendanceContent() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [perPage] = useState(8);
  const [records, setRecords] = useState<PaginatedAttendanceRecords | null>(null);
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [myStatus, setMyStatus] = useState<{
    linked: boolean;
    employee_id: string | null;
    checked_in: boolean;
    checked_out: boolean;
    check_in: string | null;
    check_out: string | null;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchMyStatus = useCallback(async () => {
    try {
      const data = await employeesApi.getMyAttendanceStatus();
      setMyStatus(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchMyStatus();
  }, [fetchMyStatus]);

  const refreshAfterChange = async () => {
    await Promise.all([fetchRecords(), fetchStats(), fetchMyStatus()]);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleMyCheckIn = async () => {
    if (!myStatus?.employee_id) return;
    setBusyId("me");
    try {
      await employeesApi.attendanceCheckIn(myStatus.employee_id);
      showToast(`Checked in at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      await refreshAfterChange();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Check-in failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleMyCheckOut = async () => {
    if (!myStatus?.employee_id) return;
    setBusyId("me");
    try {
      await employeesApi.attendanceCheckOut(myStatus.employee_id);
      showToast(`Checked out at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      await refreshAfterChange();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Check-out failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleRowCheckIn = async (employeeId: string) => {
    setBusyId(employeeId);
    try {
      await employeesApi.attendanceCheckIn(employeeId);
      showToast(`Checked in ${employeeId}`);
      await refreshAfterChange();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Check-in failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleRowCheckOut = async (employeeId: string) => {
    setBusyId(employeeId);
    try {
      await employeesApi.attendanceCheckOut(employeeId);
      showToast(`Checked out ${employeeId}`);
      await refreshAfterChange();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Check-out failed");
    } finally {
      setBusyId(null);
    }
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
        date,
      });
      if (search) params.set("search", search);
      if (department) params.set("department", department);
      if (status) params.set("status", status);
      const data = await employeesApi.getAttendanceRecords(params);
      setRecords(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, date, search, department, status]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await employeesApi.getAttendanceStats(date);
      setStats(data);
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    setPage(1);
  }, [date, search, department, status]);

  const getInitials = (f: string, l: string) => `${f[0]}${l[0]}`.toUpperCase();
  const presentCount = stats?.present ?? 0;
  const absentCount = stats?.absent ?? 0;
  const leaveCount = stats?.leave ?? 0;
  const lateCount = stats?.late ?? 0;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium pl-4 pr-5 py-3 rounded-xl shadow-xl flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-green-400"></span>
            {toast}
            <button onClick={() => setToast(null)} className="text-white/40 hover:text-white transition-colors ml-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
            <p className="text-sm text-gray-400 mt-0.5">Track and manage all employee attendance</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCsv(`/employees/export/attendance.csv?date_from=${date}&date_to=${date}`, "attendance.csv")}
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all border border-gray-200 hover:border-gray-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export CSV
            </button>
            <div className="relative">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-primary-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
              />
            </div>
            {myStatus?.checked_in && !myStatus?.checked_out ? (
              <button
                onClick={handleMyCheckOut}
                disabled={busyId === "me"}
                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-red-100"
              >
                {busyId === "me" ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                )}
                Check Out
              </button>
            ) : (
              <button
                onClick={handleMyCheckIn}
                disabled={busyId === "me" || !!myStatus?.checked_in}
                className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-primary-100"
              >
                {busyId === "me" ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                )}
                Check In
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard loading={statsLoading} label="Present" value={presentCount} color="from-green-500 to-emerald-600" icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          <StatCard loading={statsLoading} label="Absent" value={absentCount} color="from-red-400 to-rose-500" icon="M6 18L18 6M6 6l12 12" />
          <StatCard loading={statsLoading} label="On Leave" value={leaveCount} color="from-yellow-400 to-amber-500" icon="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7m-12.72 0l-.7.7m12.72-12.72l-.7.7m-12.72 0l-.7-.7M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          <StatCard loading={statsLoading} label="Late" value={lateCount} color="from-orange-400 to-orange-500" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <svg className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                type="text"
                placeholder="Search by name or employee ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all"
              />
            </div>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-400 transition-all text-gray-600 min-w-[150px]">
              <option value="">All Departments</option>
              {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-400 transition-all text-gray-600 min-w-[130px]">
              <option value="">All Status</option>
              {statuses.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            {(search || department || status) && (
              <button onClick={() => { setSearch(""); setDepartment(""); setStatus(""); }} className="px-4 py-2.5 text-xs text-gray-400 hover:text-red-500 transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Records table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
              <p className="text-sm text-gray-400">Loading attendance...</p>
            </div>
          ) : records && records.records.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50/80">
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Employee</th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Department</th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Check In</th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Check Out</th>
                      <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="text-center px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-primary-50/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {rec.profile_picture ? (
                              <img src={rec.profile_picture} className="w-9 h-9 rounded-full object-cover ring-2 ring-white" alt="" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {getInitials(rec.first_name, rec.last_name)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{rec.first_name} {rec.last_name}</p>
                              <p className="text-[11px] text-gray-400 font-mono">{rec.employee_id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500 hidden md:table-cell">{rec.employee_department}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {rec.check_in || "-"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-sm text-gray-500">{rec.check_out || "-"}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 ${statusStyles[rec.status] || "bg-gray-50 text-gray-500 ring-gray-100"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusDot[rec.status] || "bg-gray-300"}`}></span>
                            {rec.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {rec.check_out ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-600 bg-green-50 px-2.5 py-1.5 rounded-lg">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Done
                              </span>
                            ) : rec.check_in ? (
                              <button
                                onClick={() => handleRowCheckOut(rec.employee_id)}
                                disabled={busyId === rec.employee_id}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-all"
                              >
                                {busyId === rec.employee_id ? <span className="w-3 h-3 border-2 border-red-200 border-t-red-500 rounded-full animate-spin"></span> : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                )}
                                Check Out
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRowCheckIn(rec.employee_id)}
                                disabled={busyId === rec.employee_id}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-all"
                              >
                                {busyId === rec.employee_id ? <span className="w-3 h-3 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin"></span> : (
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                )}
                                Check In
                              </button>
                            )}
                            <button onClick={() => router.push(`/employees/${rec.employee_id}`)} className="text-primary-500 hover:text-primary-700 text-xs font-semibold bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-all">
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-gray-100 gap-3">
                <p className="text-xs text-gray-400">
                  Showing <span className="font-semibold text-gray-600">{(records.page - 1) * records.per_page + 1}</span> to <span className="font-semibold text-gray-600">{Math.min(records.page * records.per_page, records.total)}</span> of <span className="font-semibold text-gray-600">{records.total}</span> records
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-500">
                    Prev
                  </button>
                  {Array.from({ length: records.total_pages }, (_, i) => i + 1).slice(0, 5).map((p) => (
                    <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${p === page ? "bg-primary-500 text-white shadow-sm shadow-primary-200" : "text-gray-500 hover:bg-gray-50"}`}>
                      {p}
                    </button>
                  ))}
                  <button onClick={() => setPage(Math.min(records.total_pages, page + 1))} disabled={page === records.total_pages} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-500">
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <p className="text-sm font-semibold text-gray-500">No attendance records</p>
              <p className="text-xs text-gray-400 mt-1">No records for this date or try adjusting filters</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function StatCard({ loading, label, value, color, icon }: { loading: boolean; label: string; value: number; color: string; icon: string }) {
  return (
    <div className={`bg-gradient-to-br ${color} rounded-2xl p-4 text-white shadow-lg shadow-black/5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-white/70">{label}</p>
          <p className="text-2xl font-bold mt-1 leading-none">{loading ? "..." : value}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
        </div>
      </div>
    </div>
  );
}
