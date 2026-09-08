"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { authApi, UserRole } from "@/lib/api";
import { employeesApi, PaginatedResponse } from "@/lib/employeeApi";
import { ROLE_LABELS, isSuperAdmin } from "@/lib/auth";

const ALL_ROLES: UserRole[] = ["SUPER_ADMIN", "HR", "MANAGER", "EMPLOYEE"];
const HR_GRANTABLE: UserRole[] = ["MANAGER", "EMPLOYEE"];

const roleBadge: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-50 text-purple-600 ring-purple-100",
  HR: "bg-blue-50 text-blue-600 ring-blue-100",
  MANAGER: "bg-orange-50 text-orange-600 ring-orange-100",
  EMPLOYEE: "bg-green-50 text-green-600 ring-green-100",
};

interface UserRow {
  id: number;
  email: string;
  phone: string | null;
  role: UserRole;
}

export default function UsersPage() {
  const [meRole, setMeRole] = useState<"SUPER_ADMIN" | "HR" | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [employees, setEmployees] = useState<{ id: number; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [linkEmpId, setLinkEmpId] = useState<number>(0);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadUsers = useCallback(async () => {
    try {
      const data = await authApi.listUsers();
      setUsers(data.data);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Failed to load users");
    }
  }, []);

  useEffect(() => {
    const role = localStorage.getItem("role");
    setMeRole(role === "SUPER_ADMIN" || role === "HR" ? role : null);
  }, []);

  useEffect(() => {
    if (!meRole) return;
    Promise.all([
      loadUsers(),
      employeesApi
        .list(new URLSearchParams({ page: "1", per_page: "100" }))
        .then((r: PaginatedResponse) =>
          setEmployees(r.employees.map((e) => ({ id: e.id, label: `${e.first_name} ${e.last_name} (${e.employee_id})` })))
        )
        .catch(() => setEmployees([])),
    ]).finally(() => setLoading(false));
  }, [meRole, loadUsers]);

  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));

  const handleRoleChange = async (user: UserRow, role: UserRole) => {
    setBusyId(user.id);
    try {
      const updated = await authApi.updateRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.data.id ? updated.data : u)));
      showToast(`Role updated to ${role}`);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Failed to update role");
    } finally {
      setBusyId(null);
    }
  };

  const handleLink = async (user: UserRow) => {
    if (!linkEmpId) {
      showToast("Select an employee to link first");
      return;
    }
    setBusyId(user.id);
    try {
      await authApi.linkEmployee(user.id, linkEmpId);
      showToast(`Linked ${user.email} to employee #${linkEmpId}`);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Failed to link employee");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users & Roles</h1>
            <p className="text-sm text-gray-400 mt-0.5">Assign roles and link accounts to employee records</p>
          </div>
          <div className="flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search by email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-4 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-400 transition-all"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="bg-gray-50/80 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-5 py-3.5">Role</th>
                    <th className="px-5 py-3.5">Link Employee</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((user) => {
                    const grantable = isSuperAdmin(meRole) ? ALL_ROLES : HR_GRANTABLE;
                    return (
                      <tr key={user.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {user.email.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 leading-tight">
                              <p className="text-sm font-semibold text-gray-900 truncate">{user.email}</p>
                              <p className="text-[11px] text-gray-400">ID {user.id}{user.phone ? ` · ${user.phone}` : ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 ${roleBadge[user.role]}`}>
                            {ROLE_LABELS[user.role]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <select
                            value={linkEmpId}
                            onChange={(e) => setLinkEmpId(Number(e.target.value))}
                            className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none focus:border-primary-400 transition-all text-gray-600 max-w-[220px]"
                          >
                            <option value={0}>— Select employee —</option>
                            {employees.map((e) => (
                              <option key={e.id} value={e.id}>{e.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              value={user.role}
                              disabled={busyId === user.id}
                              onChange={(e) => handleRoleChange(user, e.target.value as UserRole)}
                              className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs outline-none focus:border-primary-400 transition-all text-gray-600 disabled:opacity-50"
                            >
                              {grantable.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleLink(user)}
                              disabled={busyId === user.id || !linkEmpId}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 text-primary-600 text-xs font-semibold hover:bg-primary-100 disabled:opacity-40 transition-all"
                            >
                              {busyId === user.id ? (
                                <span className="w-3 h-3 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin"></span>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                              )}
                              Link
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <div className="text-center text-xs text-gray-400 py-10">No users found.</div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </DashboardLayout>
  );
}