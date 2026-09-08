"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ROLE_LABELS,
  STAFF_ROLES,
  ADMIN_ROLES,
  clearSession,
  syncRoleCookie,
} from "@/lib/auth";
import type { UserRole } from "@/lib/api";

const allMenuItems = [
  { name: "Dashboard", href: "/dashboard", icon: "M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10", roles: ["SUPER_ADMIN", "HR", "MANAGER", "EMPLOYEE"] },
  { name: "Employees", href: "/employees", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 11-3-3 3 3 0 013 3z", roles: STAFF_ROLES },
  { name: "Attendance", href: "/attendance", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01", roles: STAFF_ROLES },
  { name: "Leaves", href: "/leaves", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", roles: STAFF_ROLES },
  { name: "Reports", href: "/reports", icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", roles: ["SUPER_ADMIN", "HR", "MANAGER", "EMPLOYEE"] },
  { name: "Users & Roles", href: "/users", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-3-5.196M13 7a4 4 0 11-8 0 4 4 0 018 0z", roles: ADMIN_ROLES },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  // Read role from localStorage once available on the client.
  useEffect(() => {
    syncRoleCookie();
    const stored = localStorage.getItem("role");
    const token = localStorage.getItem("token");
    if (token && stored) {
      setRole(stored);
    } else if (token) {
      // Token present but no stored role → refresh from /me.
      import("@/lib/api").then(({ authApi }) =>
        authApi
          .getMe(token)
          .then((r) => {
            localStorage.setItem("role", r.data.role);
            setRole(r.data.role);
          })
          .catch(() => clearSession())
      );
    }
  }, []);

  const menuItems = (allMenuItems as typeof allMenuItems).filter((item) =>
    item.roles.includes((role || "") as UserRole)
  );

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  const initials = role ? role.charAt(0) : "U";

  return (
    <div className="min-h-screen bg-[#E9E9F1] p-3 sm:p-4">
      <div className="flex gap-4 max-w-[1440px] mx-auto">
        {/* Sidebar */}
        <aside
          className={`fixed lg:sticky top-3 sm:top-4 left-0 z-40 w-[230px] h-[calc(100vh-1.5rem)] sm:h-[calc(100vh-2rem)] flex-shrink-0 bg-white rounded-[20px] flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${
            sidebarOpen ? "translate-x-3" : "-translate-x-full"
          }`}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-6 pt-6 pb-6">
            <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md shadow-primary-200">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[19px] font-extrabold text-gray-900 tracking-tight">trusty.</span>
          </div>

          <nav className="flex-1 px-5 overflow-y-auto">
            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.18em] px-3 mb-2.5">Menu</p>
            <div className="space-y-1.5 mb-7">
              {menuItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <div key={item.name} className="relative">
                    {active && (
                      <span className="absolute -left-5 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full"></span>
                    )}
                    <Link
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-4 py-[9px] rounded-xl text-[13px] transition-all ${
                        active
                          ? "bg-primary-500 text-white font-semibold shadow-lg shadow-primary-200"
                          : "text-gray-400 font-medium hover:text-primary-600 hover:bg-primary-50"
                      }`}
                    >
                      <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                      </svg>
                      {item.name}
                    </Link>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.18em] px-3 mb-2.5">Account</p>
            <div className="space-y-1.5">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-[9px] rounded-xl text-[13px] font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </nav>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main */}
        <div className="flex-1 min-w-0">
          {/* Navbar pill */}
          <header className="bg-white rounded-full h-[58px] flex items-center justify-between pl-2 pr-3 gap-3 mb-4">
            <div className="relative flex-1 max-w-[340px]">
              <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search employees..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    router.push(`/employees?search=${encodeURIComponent((e.target as HTMLInputElement).value)}`);
                  }
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-[#F4F4F8] rounded-full text-xs text-gray-600 placeholder-gray-300 outline-none focus:ring-2 focus:ring-primary-100 transition-all"
              />
            </div>

            <div className="flex items-center gap-1 ml-auto">
              <button className="p-2.5 text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
              <button className="relative p-2.5 text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>
              <div className="flex items-center gap-2.5 pl-1 pr-2 py-1 cursor-pointer">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold">
                  {initials}
                </div>
                <div className="hidden sm:block leading-tight">
                  <p className="text-xs font-bold text-gray-900">{(role && ROLE_LABELS[(role as UserRole)]) || "Account"}</p>
                  <p className="text-[10px] text-gray-400">{role || "…"}</p>
                </div>
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2.5 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </header>

          {/* Content */}
          <div className="pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
