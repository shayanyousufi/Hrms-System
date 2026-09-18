import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const adminRoutes = ["/users", "/payroll"];
const staffRoutes = ["/employees", "/attendance", "/leaves"];
const protectedRoutes = ["/dashboard", ...staffRoutes, ...adminRoutes, "/reports"];
const authRoutes = ["/login", "/register", "/"];

const STAFF_ROLES = ["SUPER_ADMIN", "HR", "MANAGER"];
const ADMIN_ROLES = ["SUPER_ADMIN", "HR"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  const primaryRole = request.cookies.get("role")?.value || "";
  const rolesCookie = request.cookies.get("roles")?.value;
  const roles: string[] = rolesCookie
    ? rolesCookie.split(",").map((r) => r.trim())
    : primaryRole
      ? [primaryRole]
      : [];

  const isProtected = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const isAuthRoute = authRoutes.includes(pathname);

  // Not authenticated → send to login (preserve intended destination).
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated → don't show auth screens.
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Role route guards.
  if (token) {
    const isStaffRoute = staffRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
    const isAdminRoute = adminRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

    if (isStaffRoute && !roles.some((r) => STAFF_ROLES.includes(r))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (isAdminRoute && !roles.some((r) => ADMIN_ROLES.includes(r))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/employees/:path*",
    "/attendance/:path*",
    "/leaves/:path*",
    "/users/:path*",
    "/reports/:path*",
    "/payroll/:path*",
    "/login",
    "/register",
    "/",
  ],
};