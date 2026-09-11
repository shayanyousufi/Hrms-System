import type { UserRole } from "@/lib/api";

export const SUPER_ADMIN: UserRole = "SUPER_ADMIN";
export const HR: UserRole = "HR";
export const MANAGER: UserRole = "MANAGER";
export const EMPLOYEE: UserRole = "EMPLOYEE";

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  HR: "HR",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

/** Roles that may manage other employees / see org-wide staff pages. */
export const STAFF_ROLES: UserRole[] = [SUPER_ADMIN, HR, MANAGER];
/** Roles that can administer users, roles and employee links. */
export const ADMIN_ROLES: UserRole[] = [SUPER_ADMIN, HR];

export function isStaffRole(role?: string | null): boolean {
  return !!role && (STAFF_ROLES as string[]).includes(role);
}

export function isAdminRole(role?: string | null): boolean {
  return !!role && (ADMIN_ROLES as string[]).includes(role);
}

export function isSuperAdmin(role?: string | null): boolean {
  return role === SUPER_ADMIN;
}

/** Role can create / edit / delete employees (HR-level write access). */
export function canManageEmployees(role?: string | null): boolean {
  return isAdminRole(role);
}

/** Role can approve / reject leave requests (managers may approve team only). */
export function canApproveLeaves(role?: string | null): boolean {
  return isStaffRole(role);
}

export function saveSession(token: string, role: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);
  document.cookie = `token=${token}; path=/; max-age=86400`;
  document.cookie = `role=${role}; path=/; max-age=86400`;
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  document.cookie = "token=; path=/; max-age=0";
  document.cookie = "role=; path=/; max-age=0";
}

export function getStoredRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("role");
}

/** Best-effort sync of a stale/missing role cookie from localStorage. */
export function syncRoleCookie(): void {
  if (typeof window === "undefined") return;
  const role = localStorage.getItem("role");
  const token = localStorage.getItem("token");
  if (role && token) {
    document.cookie = `role=${role}; path=/; max-age=86400`;
  }
}