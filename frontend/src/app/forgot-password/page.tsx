"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [code, setCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await authApi.forgotPassword(email);
      setCode(response.data.code || "");
      setEmailSent(response.data.email_sent || false);
      setEmailError(response.data.email_error || "");
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Something went wrong");
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

          <h2 className="text-2xl font-bold text-gray-900 mb-2">Forgot Password</h2>
          <p className="text-sm text-gray-500 mb-6">Enter your email to receive a reset code</p>

          {error && (
            <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
          )}

          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              {emailSent ? (
                <p className="text-sm text-gray-600 mb-4">Reset code sent to <strong>{email}</strong>!</p>
              ) : (
                <div className="mb-4">
                  <p className="text-sm text-orange-500 mb-1">Email bhejne mein problem aayi!</p>
                  <p className="text-xs text-gray-400">Neeche code de ke manually reset kar sakte ho</p>
                </div>
              )}

              {code && (
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4">
                  <p className="text-xs text-gray-500 mb-1">Your reset code:</p>
                  <p className="text-2xl font-bold text-primary-700 tracking-widest">{code}</p>
                </div>
              )}

              <Link href="/reset-password" className="inline-block bg-gradient-to-r from-primary-500 to-primary-400 text-white px-6 py-2.5 rounded-full font-semibold text-sm hover:from-primary-600 hover:to-primary-500 transition-all">
                Enter Reset Code
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-400 text-white py-3.5 rounded-full font-semibold text-sm hover:from-primary-600 hover:to-primary-500 transition-all disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Reset Code"}
              </button>
            </form>
          )}

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
