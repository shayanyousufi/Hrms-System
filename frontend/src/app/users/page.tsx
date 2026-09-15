"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { authApi, UserRole } from "@/lib/api";
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
  roles: UserRole[];
}

export default function UsersPage() {
  const [meRole, setMeRole] = useState<"SUPER_ADMIN" | "HR" | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
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
    const rolesRaw = localStorage.getItem("roles");
    let roles: UserRole[] = [];
    if (rolesRaw) {
      try { roles = JSON.parse(rolesRaw); } catch {}
    } else {
      const legacy = localStorage.getItem("role");
      if (legacy) roles = [legacy as UserRole];
    }
    const match = roles.find((r) => r === "SUPER_ADMIN" || r === "HR") ?? null;
    setMeRole(match as "SUPER_ADMIN" | "HR" | null);
  }, []);

  useEffect(() => {
    if (!meRole) return;
    loadUsers().finally(() => setLoading(false));
  }, [meRole, loadUsers]);

  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));

  const handleRolesChange = async (user: UserRow, roles: UserRole[]) => {
    setBusyId(user.id);
    try {
      const updated = await authApi.updateRolesBulk(user.id, roles);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, roles: updated.data.roles } : u)));
      showToast(`Roles updated to ${roles.join(", ")}`);
    } catch {
      showToast("Failed to update roles");
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
            <p className="text-sm text-gray-400 mt-0.5">Assign and manage user roles</p>
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
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50/80 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-5 py-3.5">Roles</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((user) => (
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
                        <div className="flex flex-wrap gap-1">
                          {user.roles?.map((r) => (
                            <span key={r} className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 ${roleBadge[r ?? ""] ?? ""}`}>
                              {ROLE_LABELS[r as UserRole] ?? r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {(["SUPER_ADMIN", "HR", "MANAGER", "EMPLOYEE"] as UserRole[]).map((r) => (
                            <label key={r} className="inline-flex items-center gap-1 text-[11px]">
                              <input
                                type="checkbox"
                                checked={user.roles?.includes(r) ?? false}
                                disabled={busyId === user.id}
                                onChange={(e) => {
                                  const current = user.roles || [];
                                  const next = e.target.checked
                                    ? [...current, r]
                                    : current.filter((x) => x !== r);
                                  if (next.length > 0) handleRolesChange(user, next);
                                }}
                                className="rounded border-gray-300"
                              />
                              {ROLE_LABELS[r]}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
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
