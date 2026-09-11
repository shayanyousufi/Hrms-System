"use client";

import { useState, useEffect, useCallback, useRef, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import {
  employeesApi,
  Employee,
  PaginatedAttendance,
  PaginatedLeaves,
  PaginatedActivities,
  DocumentRecord,
} from "@/lib/employeeApi";
import { canManageEmployees } from "@/lib/auth";

const tabs = ["Overview", "Attendance", "Leave", "Documents", "Activity"];

const statusColors: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  "On Leave": "bg-yellow-100 text-yellow-700",
  Inactive: "bg-red-100 text-red-700",
  Present: "bg-green-100 text-green-700",
  Absent: "bg-red-100 text-red-700",
  Leave: "bg-yellow-100 text-yellow-700",
  Approved: "bg-green-100 text-green-700",
  Pending: "bg-yellow-100 text-yellow-700",
};

const departmentColors: Record<string, string> = {
  Engineering: "bg-primary-100 text-primary-700",
  Design: "bg-pink-100 text-pink-700",
  HR: "bg-blue-100 text-blue-700",
  Finance: "bg-green-100 text-green-700",
  Marketing: "bg-orange-100 text-orange-700",
  Sales: "bg-cyan-100 text-cyan-700",
};

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(true);

  const [attendanceData, setAttendanceData] = useState<PaginatedAttendance | null>(null);
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [leavesData, setLeavesData] = useState<PaginatedLeaves | null>(null);
  const [leavesPage, setLeavesPage] = useState(1);
  const [leavesLoading, setLeavesLoading] = useState(false);

  const [activitiesData, setActivitiesData] = useState<PaginatedActivities | null>(null);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [documentError, setDocumentError] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ leave_type: "Annual", start_date: "", end_date: "", reason: "" });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("role");
    setIsAdmin(canManageEmployees(role));
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const emp = await employeesApi.get(id);
        setEmployee(emp);
      } catch {
        router.push("/employees");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  const fetchAttendance = useCallback(async (page: number) => {
    if (!employee) return;
    setAttendanceLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: "10" });
      const data = await employeesApi.getAttendance(employee.employee_id, params);
      setAttendanceData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setAttendanceLoading(false);
    }
  }, [employee]);

  const fetchLeaves = useCallback(async (page: number) => {
    if (!employee) return;
    setLeavesLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: "10" });
      const data = await employeesApi.getLeaves(employee.employee_id, params);
      setLeavesData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLeavesLoading(false);
    }
  }, [employee]);

  const fetchActivities = useCallback(async (page: number) => {
    if (!employee) return;
    setActivitiesLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), per_page: "10" });
      const data = await employeesApi.getActivities(employee.employee_id, params);
      setActivitiesData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setActivitiesLoading(false);
    }
  }, [employee]);

  const fetchDocuments = useCallback(async () => {
    if (!employee) return;
    setDocumentsLoading(true);
    setDocumentError("");
    try {
      const docs = await employeesApi.getDocuments(employee.employee_id);
      setDocuments(docs);
      setDocTypes(Array.from(new Set(docs.map((d) => d.doc_type).filter(Boolean)) as Set<string>).sort());
    } catch (e: any) {
      setDocumentError(e?.response?.data?.detail || "Failed to load documents");
    } finally {
      setDocumentsLoading(false);
    }
  }, [employee]);

  useEffect(() => {
    if (activeTab === "Attendance") fetchAttendance(attendancePage);
    if (activeTab === "Leave") fetchLeaves(leavesPage);
    if (activeTab === "Activity") fetchActivities(activitiesPage);
    if (activeTab === "Documents") fetchDocuments();
  }, [activeTab, attendancePage, leavesPage, activitiesPage, fetchAttendance, fetchLeaves, fetchActivities, fetchDocuments]);

  useEffect(() => {
    setAttendancePage(1);
    setLeavesPage(1);
    setActivitiesPage(1);
  }, [activeTab]);

  const handleDelete = async (hard: boolean) => {
    if (!employee) return;
    setDeleting(true);
    try {
      await employeesApi.delete(employee.employee_id, hard);
      router.push("/employees");
    } catch (e) {
      console.error(e);
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleLeaveRequest = async () => {
    if (!employee) return;
    setLeaveSubmitting(true);
    try {
      await employeesApi.createLeave({ employee_id: employee.id, ...leaveForm });
      setShowLeaveModal(false);
      setLeaveForm({ leave_type: "Annual", start_date: "", end_date: "", reason: "" });
      if (activeTab === "Leave") {
        const params = new URLSearchParams({ page: leavesPage.toString(), per_page: "10" });
        const data = await employeesApi.getLeaves(employee.employee_id, params);
        setLeavesData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleProfilePictureUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;
    setUploading(true);
    try {
      await employeesApi.uploadProfilePicture(employee.employee_id, file);
      setEmployee({ ...employee, profile_picture: URL.createObjectURL(file) });
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDocumentUpload = async (e: ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;
    setUploading(true);
    setDocumentError("");
    try {
      await employeesApi.uploadDocument(employee.employee_id, file, docType || "General");
      await fetchDocuments();
    } catch (err: any) {
      setDocumentError(err?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDocumentDelete = async (doc: DocumentRecord) => {
    if (!employee) return;
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    setDocumentError("");
    try {
      await employeesApi.deleteDocument(employee.employee_id, doc.id);
      await fetchDocuments();
    } catch (err: any) {
      setDocumentError(err?.response?.data?.detail || "Delete failed");
    }
  };

  const handleDocumentDownload = (doc: DocumentRecord) => {
    const token = localStorage.getItem("token");
    const base = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001/api";
    fetch(`${base}/employees/${employee!.employee_id}/documents/${doc.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => setDocumentError("Could not download document"));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-primary-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!employee) return null;

  const initials = `${employee.first_name[0]}${employee.last_name[0]}`.toUpperCase();

  return (
    <DashboardLayout>
      <div>
        <Link href="/employees" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg> Back to Employees
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="relative group cursor-pointer flex-shrink-0" onClick={() => fileInputRef.current?.click()}>
              {employee.profile_picture ? (
                <img src={employee.profile_picture} alt={`${employee.first_name} ${employee.last_name}`} className="w-16 h-16 rounded-2xl object-cover" />
              ) : (
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold ${departmentColors[employee.department] || "bg-primary-100 text-primary-700"}`}>
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePictureUpload} />
              {uploading && <div className="absolute inset-0 bg-white/80 rounded-2xl flex items-center justify-center"><span className="text-xs text-gray-500">Uploading...</span></div>}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{employee.first_name} {employee.last_name}</h1>
              <p className="text-sm text-gray-500 mt-1">{employee.designation} &middot; {employee.department}</p>
              <div className="flex flex-wrap items-center gap-3 mt-3">
                <span className="text-xs text-gray-400">{employee.employee_id}</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[employee.employment_status] || "bg-gray-100 text-gray-600"}`}>{employee.employment_status}</span>
                <span className="text-xs text-gray-400">{employee.email}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-5 pt-5 border-t border-gray-100">
            {isAdmin && (
              <Link href={`/employees/${id}/edit`} className="bg-primary-50 hover:bg-primary-100 text-primary-600 text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              Edit
              </Link>
            )}
            <button onClick={() => setShowLeaveModal(true)} className="bg-green-50 hover:bg-green-100 text-green-600 text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Request Leave
            </button>
            {isAdmin && (
              <button onClick={() => setShowDeleteModal(true)} className="bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete
              </button>
            )}
          </div>
        </div>

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Employee</h3>
              <p className="text-sm text-gray-500 mb-5">Choose how to remove {employee.first_name} {employee.last_name}:</p>
              <div className="space-y-3 mb-5">
                <button onClick={() => handleDelete(false)} disabled={deleting} className="w-full text-left p-3 rounded-xl border-2 border-yellow-200 hover:border-yellow-400 bg-yellow-50 transition-colors disabled:opacity-50">
                  <p className="text-sm font-semibold text-yellow-700">Soft Delete (Recommended)</p>
                  <p className="text-xs text-yellow-600 mt-0.5">Mark as inactive. Data preserved, can be restored.</p>
                </button>
                <button onClick={() => handleDelete(true)} disabled={deleting} className="w-full text-left p-3 rounded-xl border-2 border-red-200 hover:border-red-400 bg-red-50 transition-colors disabled:opacity-50">
                  <p className="text-sm font-semibold text-red-700">Hard Delete (Permanent)</p>
                  <p className="text-xs text-red-600 mt-0.5">Permanently remove all data. Cannot be undone.</p>
                </button>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="w-full px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Leave Request Modal */}
        {showLeaveModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Request Leave</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Leave Type</label>
                  <select value={leaveForm.leave_type} onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                    <option>Annual</option>
                    <option>Sick</option>
                    <option>Personal</option>
                    <option>Unpaid</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                    <input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                    <input type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
                  <textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} rows={3} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none" placeholder="Optional reason for leave..." />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowLeaveModal(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                  Cancel
                </button>
                <button onClick={handleLeaveRequest} disabled={leaveSubmitting || !leaveForm.start_date || !leaveForm.end_date} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-primary-500 rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50">
                  {leaveSubmitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm p-2 mb-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? "bg-primary-500 text-white shadow-md shadow-primary-200"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          {activeTab === "Overview" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InfoCard title="Contact Information" items={[
                { label: "Email", value: employee.email },
                { label: "Phone", value: employee.phone || "N/A" },
                { label: "Address", value: employee.address || "N/A" },
              ]} />
              <InfoCard title="Employment Details" items={[
                { label: "Department", value: employee.department },
                { label: "Designation", value: employee.designation },
                { label: "Reporting Manager", value: employee.reporting_manager || "N/A" },
                { label: "Joining Date", value: new Date(employee.joining_date).toLocaleDateString() },
                { label: "Leave Balance", value: employee.leave_balance != null ? `${employee.leave_balance} days` : "N/A" },
              ]} />
              <InfoCard title="Personal Details" items={[
                { label: "CNIC", value: employee.cnic || "N/A" },
                { label: "Gender", value: employee.gender || "N/A" },
                { label: "Date of Birth", value: employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString() : "N/A" },
              ]} />
              <InfoCard title="Emergency Contact" items={[
                { label: "Name", value: employee.emergency_contact_name || "N/A" },
                { label: "Phone", value: employee.emergency_contact_phone || "N/A" },
                { label: "Relation", value: employee.emergency_contact_relation || "N/A" },
              ]} />
            </div>
          )}

          {activeTab === "Attendance" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Attendance History</h3>
              {attendanceLoading ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div></div>
              ) : attendanceData && attendanceData.records.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Check In</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Check Out</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceData.records.map((a) => (
                          <tr key={a.id} className="border-b border-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-700">{new Date(a.date).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{a.check_in || "-"}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{a.check_out || "-"}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[a.status] || "bg-gray-100 text-gray-600"}`}>{a.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={attendanceData.page} totalPages={attendanceData.total_pages} total={attendanceData.total} onPageChange={setAttendancePage} />
                </>
              ) : (
                <EmptyState message="No attendance records found" />
              )}
            </div>
          )}

          {activeTab === "Leave" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Leave Records</h3>
              {leavesLoading ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div></div>
              ) : leavesData && leavesData.records.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Type</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Start</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">End</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leavesData.records.map((l) => (
                          <tr key={l.id} className="border-b border-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-700">{l.leave_type}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{new Date(l.start_date).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{new Date(l.end_date).toLocaleDateString()}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[l.status] || "bg-gray-100 text-gray-600"}`}>{l.status}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{l.reason || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={leavesData.page} totalPages={leavesData.total_pages} total={leavesData.total} onPageChange={setLeavesPage} />
                </>
              ) : (
                <EmptyState message="No leave records found" />
              )}
            </div>
          )}

          {activeTab === "Documents" && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select id="documentType" defaultValue="General" className="px-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-primary-300 text-gray-600 min-w-[140px]">
                    <option value="General">General</option>
                    <option value="CNIC">CNIC</option>
                    <option value="Contract">Contract</option>
                    <option value="Offer Letter">Offer Letter</option>
                    <option value="Resume">Resume</option>
                    <option value="Degree">Degree</option>
                    {docTypes.filter((t) => !["General", "CNIC", "Contract", "Offer Letter", "Resume", "Degree"].includes(t)).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <label className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" /></svg>
                    {uploading ? "Uploading..." : "Upload"}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => handleDocumentUpload(e, (document.getElementById("documentType") as HTMLSelectElement)?.value || "General")}
                    />
                  </label>
                </div>
              </div>

              {documentError && <p className="mb-3 text-xs text-red-500">{documentError}</p>}

              {documentsLoading ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div></div>
              ) : documents.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Name</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Type</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Uploaded</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">By</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((d) => (
                          <tr key={d.id} className="border-b border-gray-50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                {d.name}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-600">{d.doc_type}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : "-"}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{d.uploaded_by_name || "System"}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-2">
                                {d.has_file ? (
                                  <button onClick={() => handleDocumentDownload(d)} className="text-primary-500 hover:text-primary-700 text-xs font-semibold bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-all" title="Download">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-gray-300 font-medium">No file</span>
                                )}
                                {isAdmin && (
                                  <button onClick={() => handleDocumentDelete(d)} className="text-red-500 hover:text-red-700 text-xs font-semibold bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-all" title="Delete">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">{documents.length} document(s)</p>
                </>
              ) : (
                <EmptyState message="No documents found" />
              )}
            </div>
          )}

          {activeTab === "Activity" && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h3>
              {activitiesLoading ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div></div>
              ) : activitiesData && activitiesData.records.length > 0 ? (
                <>
                  <div className="space-y-4">
                    {activitiesData.records.map((a) => (
                      <div key={a.id} className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary-600"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" /></svg></span>
                        </div>
                        <div className="flex-1 pb-4 border-b border-gray-50">
                          <p className="text-sm text-gray-700">{a.action}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400">{a.performed_by || "System"}</p>
                            {a.timestamp && (
                              <>
                                <span className="text-gray-300">&middot;</span>
                                <p className="text-xs text-gray-400">{new Date(a.timestamp).toLocaleString()}</p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Pagination page={activitiesData.page} totalPages={activitiesData.total_pages} total={activitiesData.total} onPageChange={setActivitiesPage} />
                </>
              ) : (
                <EmptyState message="No activity logs found" />
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function InfoCard({ title, items }: { title: string; items: { label: string; value: string }[] }) {
  return (
    <div className="bg-gray-50 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between">
            <span className="text-xs text-gray-500">{item.label}</span>
            <span className="text-xs font-medium text-gray-700">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      <p className="text-sm mt-2">{message}</p>
    </div>
  );
}

function Pagination({ page, totalPages, total, onPageChange }: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Page {page} of {totalPages} ({total} records)
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
              p === page
                ? "bg-primary-500 text-white"
                : "hover:bg-gray-50 text-gray-600"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
