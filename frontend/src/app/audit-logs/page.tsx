"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { auditApi, AuditLogEntry, ActionType } from "@/lib/auditApi";

const ACTION_LABELS: Record<string, string> = {
  role_replaced: "Role Replaced",
  roles_bulk_updated: "Roles Bulk Updated",
};

const ACTION_COLORS: Record<string, string> = {
  role_replaced: "bg-blue-50 text-blue-600",
  roles_bulk_updated: "bg-purple-50 text-purple-600",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const perPage = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        per_page: perPage.toString(),
      });
      if (actionFilter) params.set("action", actionFilter);
      const data = await auditApi.list(params);
      setLogs(data);
      if (data.length < perPage && page === 1) {
        setTotal(data.length);
      }
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    auditApi.actionTypes().then(setActionTypes).catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  const formatAction = (action: string) => ACTION_LABELS[action] || action;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track who changed whose role and when</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-gray-400">Filter by action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:border-primary-300 transition-all text-gray-600 min-w-[180px]"
          >
            <option value="">All actions</option>
            {actionTypes.map((at) => (
              <option key={at.action} value={at.action}>
                {formatAction(at.action)} ({at.count})
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Loading audit logs...</p>
            </div>
          ) : logs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Performed By</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Target User</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Old Roles</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">New Roles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        }) : "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-600"}`}>
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{log.performer_email || "—"}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{log.target_email || "—"}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-gray-500 font-mono bg-gray-50 px-2 py-0.5 rounded">{log.old_value || "—"}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-green-600 font-mono bg-green-50 px-2 py-0.5 rounded">{log.new_value || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-500">No audit logs yet</p>
              <p className="text-xs text-gray-400 mt-1">Role changes will appear here</p>
            </div>
          )}

          {/* Pagination */}
          {logs.length > 0 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Page <span className="font-semibold text-gray-600">{page}</span>
                {logs.length === perPage && " — more available"}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-500"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={logs.length < perPage}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-gray-500"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
