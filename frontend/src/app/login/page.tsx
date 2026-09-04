"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await authApi.login({ email, password });
      const token = response.data.access_token;
      localStorage.setItem("token", token);
      document.cookie = `token=${token}; path=/; max-age=86400`;
      setShowWelcome(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed");
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

          <h2 className="text-2xl font-bold text-gray-900 mb-6">Login</h2>

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
              />
            </div>

            <div className="mb-2">
              <label className="block text-xs text-primary-600 font-medium mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="example_1"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <div className="text-right mb-6">
              <Link href="/forgot-password" className="text-xs text-primary-500 hover:text-primary-600 font-medium">
                Forgot Password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-400 text-white py-3.5 rounded-full font-semibold text-sm hover:from-primary-600 hover:to-primary-500 transition-all disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary-600 font-semibold hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>

      {showWelcome && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl animate-bounce-in">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Welcome!</h3>
            <p className="text-sm text-gray-500">Login successful. Redirecting to dashboard...</p>
          </div>
        </div>
      )}
    </div>
  );
}
