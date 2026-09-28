"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      await authApi.resetPassword(email, token, newPassword);
      alert("Password reset successful!");
      router.push("/login");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid or expired reset token");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-200 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <span className="text-xl font-bold text-gray-900">trusty.</span>
            <div className="w-16 h-16 relative">
              <svg className="w-full h-full" viewBox="0 0 60 70" fill="none">
                <circle cx="30" cy="25" r="14" fill="#d8b4fe" />
                <rect x="22" y="35" width="16" height="28" rx="5" fill="#d8b4fe" />
                <rect x="16" y="38" width="8" height="18" rx="4" fill="#d8b4fe" />
                <rect x="36" y="38" width="8" height="18" rx="4" fill="#d8b4fe" />
                <rect x="27" y="21" width="2.5" height="2.5" rx="1" fill="#581c87" />
                <rect x="33" y="21" width="2.5" height="2.5" rx="1" fill="#581c87" />
                <path d="M28 28 Q30 31 33 28" stroke="#581c87" strokeWidth="1" fill="none" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Reset Password</h2>
          <p className="text-sm text-gray-500 mb-6">Enter the code from your email and new password</p>

          {error && (
            <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-xs text-primary-600 font-medium mb-1.5">Email Address</label>
              <input
                type="email"
                placeholder="example@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-400 transition-colors"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-primary-600 font-medium mb-1.5">Reset Code</label>
              <input
                type="text"
                placeholder="Paste the reset code from your email"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-400 transition-colors"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-xs text-primary-600 font-medium mb-1.5">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="example_1"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-primary-400 transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-400 text-white py-3.5 rounded-full font-semibold text-sm hover:from-primary-600 hover:to-primary-500 transition-all disabled:opacity-50"
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            <Link href="/login" className="text-primary-600 font-semibold hover:underline">
              ← Back to Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
