"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { payrollApi, PayrollRun } from "@/lib/payrollApi";
import { getStoredRoles, isAdminRole } from "@/lib/auth";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  finalized: "bg-amber-50 text-amber-700",
  paid: "bg-green-50 text-green-700",
};

const STATUS_DOTS: Record<string, string> = {
  draft: "bg-gray-400",
  finalized: "bg-amber-500",
  paid: "bg-green-500",
};

export default function PayrollPage() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [period, setPeriod] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    setCanEdit(isAdminRole(getStoredRoles()));
    fetchRuns();
  }, []);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const r = await payrollApi.listRuns();
      setRuns(r.data);
    } catch {
      // handled below
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!period) return;
    setCreating(true);
    setError("");
    try {
      await payrollApi.createRun(period);
      setShowCreate(false);
      setPeriod("");
      fetchRuns();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to create run");
    } finally {
      setCreating(false);
    }
  };

  const totalNetPay = runs.reduce((s, r) => s + parseFloat(r.total_net_pay || "0"), 0);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage monthly payroll runs</p>
          </div>
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-primary-200 hover:shadow-lg hover:shadow-primary-300 self-start"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Payroll Run
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Runs" value={runs.length} color="primary" />
          <StatCard label="Draft" value={runs.filter((r) => r.status === "draft").length} color="gray" />
          <StatCard label="Finalized" value={runs.filter((r) => r.status === "finalized").length} color="amber" />
          <StatCard label="Paid" value={runs.filter((r) => r.status === "paid").length} color="green" />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Loading payroll runs...</p>
            </div>
          ) : runs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Period</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Created By</th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Payslips</th>
                    <th className="text-right px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Net Pay</th>
                    <th className="text-center px-5 py-3.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-primary-50/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-semibold text-gray-900">{formatPeriod(run.period)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize ${STATUS_STYLES[run.status] || STATUS_STYLES.draft}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[run.status] || STATUS_DOTS.draft}`} />
                          {run.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-500 hidden md:table-cell">{run.creator_email || "—"}</td>
                      <td className="px-5 py-3.5 text-right text-sm font-medium text-gray-700">{run.payslip_count}</td>
                      <td className="px-5 py-3.5 text-right text-sm font-semibold text-gray-900">${parseFloat(run.total_net_pay || "0").toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-center">
                        <Link
                          href={`/payroll/${run.id}`}
                          className="text-primary-500 hover:text-primary-700 text-xs font-semibold bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Open
                        </Link>
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-500">No payroll runs yet</p>
              <p className="text-xs text-gray-400 mt-1">Create your first payroll run to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">New Payroll Run</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <label className="block mb-1 text-xs font-medium text-gray-500">Period (YYYY-MM)</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all text-gray-700"
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating || !period} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50">
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function formatPeriod(p: string): string {
  const [y, m] = p.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    primary: "from-primary-500 to-primary-600 shadow-primary-200",
    gray: "from-gray-400 to-gray-500 shadow-gray-200",
    amber: "from-amber-400 to-amber-500 shadow-amber-200",
    green: "from-green-500 to-emerald-600 shadow-green-200",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} rounded-2xl p-4 text-white shadow-lg`}>
      <p className="text-[11px] font-medium text-white/70">{label}</p>
      <p className="text-2xl font-bold mt-1 leading-none">{value}</p>
    </div>
  );
}
