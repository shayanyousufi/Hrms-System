"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { payrollApi, PayrollRun, Payslip, LineItem } from "@/lib/payrollApi";
import { employeesApi } from "@/lib/employeeApi";
import { getStoredRoles, isAdminRole, isSuperAdmin } from "@/lib/auth";

const ALLOW_CATS = ["transport", "medical", "housing", "other"];
const DED_CATS = ["eobi", "loan", "advance", "other"];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  finalized: "bg-amber-50 text-amber-700",
  paid: "bg-green-50 text-green-700",
};

export default function PayrollRunDetailPage() {
  const { run_id } = useParams<{ run_id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [expandedPayslip, setExpandedPayslip] = useState<number | null>(null);

  // Add payslip modal
  const [showAddPayslip, setShowAddPayslip] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<number | null>(null);
  const [addingPayslip, setAddingPayslip] = useState(false);

  // Line item modal
  const [lineItemModal, setLineItemModal] = useState<{ payslipId: number; type: "allowance" | "deduction" } | null>(null);
  const [liCategory, setLiCategory] = useState("");
  const [liAmount, setLiAmount] = useState("");
  const [liError, setLiError] = useState("");
  const [liBusy, setLiBusy] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<number | null>(null);

  const fetchRun = useCallback(async () => {
    try {
      const r = await payrollApi.getRun(Number(run_id));
      setRun(r.data);
    } catch {
      router.push("/payroll");
    } finally {
      setLoading(false);
    }
  }, [run_id, router]);

  useEffect(() => {
    const roles = getStoredRoles();
    setCanEdit(isAdminRole(roles));
    setIsSuper(isSuperAdmin(roles));
    fetchRun();
  }, [fetchRun]);

  const handleStatus = async (status: string) => {
    try {
      await payrollApi.updateRunStatus(Number(run_id), status);
      fetchRun();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this draft payroll run?")) return;
    try {
      await payrollApi.deleteRun(Number(run_id));
      router.push("/payroll");
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed");
    }
  };

  const openAddPayslip = async () => {
    setShowAddPayslip(true);
    try {
      const r = await employeesApi.list(new URLSearchParams({ per_page: "200" }));
      setEmployees(r.employees);
    } catch {
      setEmployees([]);
    }
  };

  const handleAddPayslip = async () => {
    if (!selectedEmp) return;
    setAddingPayslip(true);
    try {
      await payrollApi.addPayslip(Number(run_id), selectedEmp);
      setShowAddPayslip(false);
      setSelectedEmp(null);
      fetchRun();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed");
    } finally {
      setAddingPayslip(false);
    }
  };

  const handleBulkAdd = async () => {
    const ids = employees.map((e: any) => e.id);
    if (ids.length === 0) return;
    try {
      await payrollApi.addPayslipsBulk(Number(run_id), ids);
      fetchRun();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed");
    }
  };

  const handleRemovePayslip = async (payslipId: number) => {
    if (!confirm("Remove this payslip?")) return;
    try {
      await payrollApi.removePayslip(Number(run_id), payslipId);
      fetchRun();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed");
    }
  };

  const openLineItem = (payslipId: number, type: "allowance" | "deduction") => {
    setLineItemModal({ payslipId, type });
    setLiCategory("");
    setLiAmount("");
    setLiError("");
  };

  const handleAddLineItem = async () => {
    if (!lineItemModal || !liCategory || !liAmount) return;
    setLiBusy(true);
    setLiError("");
    try {
      if (lineItemModal.type === "allowance") {
        await payrollApi.addAllowance(lineItemModal.payslipId, liCategory, Number(liAmount));
      } else {
        await payrollApi.addDeduction(lineItemModal.payslipId, liCategory, Number(liAmount));
      }
      setLineItemModal(null);
      fetchRun();
    } catch (e: any) {
      setLiError(e?.response?.data?.detail || "Failed");
    } finally {
      setLiBusy(false);
    }
  };

  const handleRemoveLineItem = async (payslipId: number, type: "allowance" | "deduction", itemId: number) => {
    try {
      if (type === "allowance") {
        await payrollApi.removeAllowance(payslipId, itemId);
      } else {
        await payrollApi.removeDeduction(payslipId, itemId);
      }
      fetchRun();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed");
    }
  };

  const handleDownloadPdf = async (ps: Payslip) => {
    if (!run) return;
    setDownloadingPdf(ps.id);
    try {
      const filename = `payslip_${ps.employee_code || ps.employee_id}_${run.period}.pdf`;
      await payrollApi.downloadPdf(ps.id, filename);
    } catch {
      alert("Failed to download PDF");
    } finally {
      setDownloadingPdf(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!run) return null;

  const isDraft = run.status === "draft";
  const isFinalized = run.status === "finalized";

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <button onClick={() => router.push("/payroll")} className="text-xs text-gray-400 hover:text-primary-500 mb-1 inline-flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Back to Payroll
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{formatPeriod(run.period)}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize ${STATUS_STYLES[run.status] || ""}`}>
                {run.status}
              </span>
              <span className="text-xs text-gray-400">{run.payslip_count} payslips</span>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2 self-start flex-wrap">
              {isDraft && (
                <>
                  <button onClick={openAddPayslip} className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3.5 py-2 rounded-xl border border-gray-200 hover:border-gray-300 transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Add Payslip
                  </button>
                  <button onClick={handleBulkAdd} className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3.5 py-2 rounded-xl border border-gray-200 hover:border-gray-300 transition-all">
                    Add All Employees
                  </button>
                  <button onClick={() => handleStatus("finalized")} className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm shadow-amber-200 transition-all">
                    Finalize
                  </button>
                  <button onClick={handleDelete} className="inline-flex items-center gap-1.5 bg-white hover:bg-red-50 text-red-500 text-xs font-semibold px-3.5 py-2 rounded-xl border border-gray-200 hover:border-red-200 transition-all">
                    Delete
                  </button>
                </>
              )}
              {isFinalized && isSuper && (
                <button onClick={() => handleStatus("paid")} className="inline-flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm shadow-green-200 transition-all">
                  Mark as Paid
                </button>
              )}
            </div>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[11px] font-medium text-gray-400">Total Base Salary</p>
            <p className="text-xl font-bold text-gray-900 mt-1">
              ${run.payslips?.reduce((s, p) => s + parseFloat(p.base_salary || "0"), 0).toLocaleString() || "0"}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[11px] font-medium text-gray-400">Total Allowances</p>
            <p className="text-xl font-bold text-green-600 mt-1">
              +${run.payslips?.reduce((s, p) => s + parseFloat(p.total_allowances || "0"), 0).toLocaleString() || "0"}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[11px] font-medium text-gray-400">Total Net Pay</p>
            <p className="text-xl font-bold text-primary-600 mt-1">
              ${run.payslips?.reduce((s, p) => s + parseFloat(p.net_pay || "0"), 0).toLocaleString() || "0"}
            </p>
          </div>
        </div>

        {/* Payslips */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {run.payslips && run.payslips.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Employee</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Base Salary</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Allowances</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Deductions</th>
                    <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Net Pay</th>
                    <th className="text-center px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {run.payslips.map((ps) => (
                    <>
                      <tr key={ps.id} className="hover:bg-primary-50/30 transition-colors cursor-pointer" onClick={() => setExpandedPayslip(expandedPayslip === ps.id ? null : ps.id)}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <svg className={`w-4 h-4 text-gray-300 transition-transform ${expandedPayslip === ps.id ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{ps.employee_name || `Employee #${ps.employee_id}`}</p>
                              {ps.employee_code && <p className="text-[11px] text-gray-400 font-mono">{ps.employee_code}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-sm text-gray-600">${parseFloat(ps.base_salary).toLocaleString()}</td>
                        <td className="px-5 py-3 text-right text-sm text-green-600 font-medium">+${parseFloat(ps.total_allowances || "0").toLocaleString()}</td>
                        <td className="px-5 py-3 text-right text-sm text-red-500 font-medium">-${parseFloat(ps.total_deductions || "0").toLocaleString()}</td>
                        <td className="px-5 py-3 text-right text-sm font-bold text-gray-900">${parseFloat(ps.net_pay).toLocaleString()}</td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDownloadPdf(ps); }}
                              disabled={downloadingPdf === ps.id}
                              className="text-primary-500 hover:text-primary-700 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-primary-50 transition-all disabled:opacity-50"
                              title="Download PDF"
                            >
                              {downloadingPdf === ps.id ? (
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              )}
                            </button>
                            {isDraft && (
                              <button onClick={(e) => { e.stopPropagation(); handleRemovePayslip(ps.id); }} className="text-red-400 hover:text-red-600 text-xs font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-all">
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedPayslip === ps.id && (
                        <tr key={`${ps.id}-detail`}>
                          <td colSpan={6} className="px-5 py-4 bg-gray-50/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Allowances */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Allowances</h4>
                                  {isDraft && (
                                    <button onClick={() => openLineItem(ps.id, "allowance")} className="text-[11px] font-semibold text-primary-500 hover:text-primary-700">
                                      + Add
                                    </button>
                                  )}
                                </div>
                                {ps.allowances.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {ps.allowances.map((a) => (
                                      <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                        <span className="text-xs font-medium text-gray-600 capitalize">{a.category}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-semibold text-green-600">${parseFloat(a.amount).toLocaleString()}</span>
                                          {isDraft && (
                                            <button onClick={() => handleRemoveLineItem(ps.id, "allowance", a.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">No allowances</p>
                                )}
                              </div>

                              {/* Deductions */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Deductions</h4>
                                  {isDraft && (
                                    <button onClick={() => openLineItem(ps.id, "deduction")} className="text-[11px] font-semibold text-primary-500 hover:text-primary-700">
                                      + Add
                                    </button>
                                  )}
                                </div>
                                {ps.deductions.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {ps.deductions.map((d) => (
                                      <div key={d.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                        <span className="text-xs font-medium text-gray-600 capitalize">{d.category}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-semibold text-red-500">${parseFloat(d.amount).toLocaleString()}</span>
                                          {isDraft && (
                                            <button onClick={() => handleRemoveLineItem(ps.id, "deduction", d.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">No deductions</p>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDownloadPdf(ps); }}
                                disabled={downloadingPdf === ps.id}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-500 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Download PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <p className="text-sm font-semibold text-gray-500">No payslips in this run</p>
              <p className="text-xs text-gray-400 mt-1">Click "Add Payslip" to add employees</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Payslip Modal */}
      {showAddPayslip && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add Payslip</h3>
              <button onClick={() => setShowAddPayslip(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <label className="block mb-1 text-xs font-medium text-gray-500">Select Employee</label>
            <select
              value={selectedEmp ?? ""}
              onChange={(e) => setSelectedEmp(Number(e.target.value) || null)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all text-gray-700"
            >
              <option value="">Choose employee...</option>
              {employees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_id})</option>
              ))}
            </select>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowAddPayslip(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleAddPayslip} disabled={addingPayslip || !selectedEmp} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50">
                {addingPayslip ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Line Item Modal */}
      {lineItemModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 capitalize">Add {lineItemModal.type}</h3>
              <button onClick={() => setLineItemModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <label className="block mb-1 text-xs font-medium text-gray-500">Category</label>
            <select
              value={liCategory}
              onChange={(e) => setLiCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all text-gray-700 mb-3"
            >
              <option value="">Select category...</option>
              {(lineItemModal.type === "allowance" ? ALLOW_CATS : DED_CATS).map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <label className="block mb-1 text-xs font-medium text-gray-500">Amount</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={liAmount}
              onChange={(e) => setLiAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-100 transition-all text-gray-700"
            />
            {liError && <p className="mt-2 text-xs text-red-500">{liError}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={() => setLineItemModal(null)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button onClick={handleAddLineItem} disabled={liBusy || !liCategory || !liAmount} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50">
                {liBusy ? "Adding..." : "Add"}
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
