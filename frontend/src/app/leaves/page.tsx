"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { employeesApi, PaginatedLeaves, downloadCsv } from "@/lib/employeeApi";

const statusTabs = ["All", "Pending", "Approved", "Rejected"];

const statusStyles: Record<string, string> = {
  Pending: "bg-yellow-50 text-yellow-600 ring-yellow-100",
  Approved: "bg-green-50 text-green-600 ring-green-100",
  Rejected: "bg-red-50 text-red-500 ring-red-100",
};

const statusDot: Record<string, string> = {
  Pending: "bg-yellow-500",
  Approved: "bg-green-500",
  Rejected: "bg-red-400",
};

function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function formatDate(value: string): string {
  const d = new Date(value + "T00:00:00");
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function LeavesPage() {
  return (
    <Suspense>
      <LeavesContent />
    </Suspense>
  );
}

function LeavesContent() {
  const [status, setStatus] = useState("Pending");
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [data, setData] = useState<PaginatedLeaves | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchLeaves = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (status !== "All") params.set("status", status);
    employeesApi
      .getAllLeaves(params)
      .then(setData)
      .catch(() => showToast("Failed to load leave requests"))
      .finally(() => setLoading(false));
  }, [page, status, perPage]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const decide = async (leaveId: number, status: string) => {
    setBusyId(leaveId);
    try {
      await employeesApi.updateLeave(leaveId, { status });
      showToast(`Leave ${status.toLowerCase()}`);
      fetchLeaves();
    } catch {
      showToast("Failed to update leave");
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = () => {
    downloadCsv("/employees/export/leaves.csv", "leaves.csv");
    showToast("Exporting leaves.csv");
  };

  const pendingCount = data?.records?.filter((r) => r.status === "Pending").length ?? 0;
  const approvedCount = data?.records?.filter((r) => r.status === "Approved").length ?? 0;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[22px] font-extrabold text-gray-900">Leave Requests</h1>
            <p className="text-xs text-gray-400">Approve or reject employee leave requests.</p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-500 text-white text-xs font-semibold shadow-lg shadow-primary-200 hover:bg-primary-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {statusTabs.map((s) => {
            const count =
              s === "All"
                ? data?.total ?? 0
                : s === "Pending"
                ? pendingCount
                : s === "Approved"
                ? approvedCount
                : (data?.records?.filter((r) => r.status === "Rejected").length ?? 0);
            return (
              <button
                key={s}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                  status === s
                    ? "bg-primary-500 text-white shadow-lg shadow-primary-200"
                    : "bg-white text-gray-500 hover:text-primary-600"
                }`}
              >
                {s} <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-white rounded-[20px] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-3.5 font-semibold">Employee</th>
                  <th className="px-5 py-3.5 font-semibold">Type</th>
                  <th className="px-5 py-3.5 font-semibold">Dates</th>
                  <th className="px-5 py-3.5 font-semibold">Days</th>
                  <th className="px-5 py-3.5 font-semibold">Balance</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-xs text-gray-400">
                      Loading leave requests...
                    </td>
                  </tr>
                ) : !data?.records?.length ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-xs text-gray-400">
                      No leave requests found.
                    </td>
                  </tr>
                ) : (
                  data.records.map((rec) => {
                    const days = daysBetween(rec.start_date, rec.end_date);
                    return (
                      <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                              {((rec.first_name?.[0] ?? "?") + (rec.last_name?.[0] ?? "")).toUpperCase()}
                            </div>
                            <div className="leading-tight">
                              <p className="text-[13px] font-bold text-gray-900">
                                {rec.first_name ?? ""} {rec.last_name ?? ""}
                              </p>
                              <p className="text-[11px] text-gray-400">{rec.employee_code ?? `#${rec.employee_id}`}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-[13px] font-medium text-gray-600">{rec.leave_type}</td>
                        <td className="px-5 py-3.5 text-[12px] text-gray-500">
                          {formatDate(rec.start_date)} → {formatDate(rec.end_date)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[13px] font-bold text-gray-800">{days}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-[13px] font-semibold text-gray-600">
                            {rec.leave_balance ?? "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ${statusStyles[rec.status]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusDot[rec.status]}`}></span>
                            {rec.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {rec.status === "Pending" ? (
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                disabled={busyId === rec.id}
                                onClick={() => decide(rec.id, "Approved")}
                                className="px-3 py-1.5 rounded-lg bg-green-50 text-green-600 text-[11px] font-bold hover:bg-green-100 transition-colors disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                disabled={busyId === rec.id}
                                onClick={() => decide(rec.id, "Rejected")}
                                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-500 text-[11px] font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[12px] text-gray-300 text-right block">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total_pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
              <p className="text-[11px] text-gray-400">
                Page {data.page} of {data.total_pages} · {data.total} requests
              </p>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-semibold text-gray-600 disabled:opacity-40 hover:border-primary-300"
                >
                  Prev
                </button>
                <button
                  disabled={page >= data.total_pages}
                  onClick={() => setPage(page + 1)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-semibold text-gray-600 disabled:opacity-40 hover:border-primary-300"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </DashboardLayout>
  );
}
