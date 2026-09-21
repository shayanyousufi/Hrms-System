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

function _toArray(role?: string | null | string[]): string[] {
  if (!role) return [];
  return Array.isArray(role) ? role : [role];
}

export function isStaffRole(role?: string | null | string[]): boolean {
  const roles = _toArray(role);
  return roles.some((r) => (STAFF_ROLES as string[]).includes(r));
}

export function isAdminRole(role?: string | null | string[]): boolean {
  const roles = _toArray(role);
  return roles.some((r) => (ADMIN_ROLES as string[]).includes(r));
}

export function isSuperAdmin(role?: string | null | string[]): boolean {
  const roles = _toArray(role);
  return roles.some((r) => r === SUPER_ADMIN);
}

/** Role can create / edit / delete employees (HR-level write access). */
export function canManageEmployees(role?: string | null | string[]): boolean {
  return isAdminRole(role);
}

/** Role can approve / reject leave requests (managers may approve team only). */
export function canApproveLeaves(role?: string | null | string[]): boolean {
  return isStaffRole(role);
}

export function saveSession(token: string, roles: string[], employeeId?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("token", token);
  localStorage.setItem("roles", JSON.stringify(roles));
  if (employeeId) {
    localStorage.setItem("employee_id", employeeId);
  }
  document.cookie = `token=${token}; path=/; max-age=86400`;
  document.cookie = `role=${roles[0] ?? ""}; path=/; max-age=86400`;
  document.cookie = `roles=${roles.join(",")}; path=/; max-age=86400`;
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("roles");
  localStorage.removeItem("role");
  localStorage.removeItem("employee_id");
  document.cookie = "token=; path=/; max-age=0";
  document.cookie = "role=; path=/; max-age=0";
  document.cookie = "roles=; path=/; max-age=0";
}

export function getStoredRoles(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("roles");
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // fall through
  }
  const single = localStorage.getItem("role");
  return single ? [single] : [];
}

export function getStoredRole(): string | null {
  if (typeof window === "undefined") return null;
  const roles = getStoredRoles();
  return roles.length > 0 ? roles[0] : null;
}

export function getStoredEmployeeId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("employee_id");
}

/** Best-effort sync of stale/missing role cookies from localStorage. */
export function syncRoleCookie(): void {
  if (typeof window === "undefined") return;
  const roles = getStoredRoles();
  const token = localStorage.getItem("token");
  if (roles.length > 0 && token) {
    document.cookie = `role=${roles[0]}; path=/; max-age=86400`;
    document.cookie = `roles=${roles.join(",")}; path=/; max-age=86400`;
  }
}
