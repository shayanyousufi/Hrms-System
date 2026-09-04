"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-primary-600 p-4">
      <div className="w-full max-w-sm bg-primary-100 rounded-[2.5rem] p-8 relative overflow-hidden min-h-[580px] flex flex-col justify-between">
        <div className="absolute top-0 right-0 w-40 h-40">
          <div className="relative">
            <div className="absolute top-6 right-4 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-full font-medium">
              hello
            </div>
            <svg className="w-36 h-44" viewBox="0 0 140 170" fill="none">
              <ellipse cx="70" cy="150" rx="40" ry="8" fill="#d8b4fe" />
              <rect x="55" y="80" width="30" height="65" rx="8" fill="#c084fc" />
              <rect x="50" y="80" width="40" height="30" rx="10" fill="#c084fc" />
              <circle cx="70" cy="55" r="25" fill="#c084fc" />
              <rect x="62" y="48" width="4" height="4" rx="2" fill="#581c87" />
              <rect x="74" y="48" width="4" height="4" rx="2" fill="#581c87" />
              <path d="M66 58 Q70 62 74 58" stroke="#581c87" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <rect x="42" y="90" width="12" height="40" rx="6" fill="#c084fc" />
              <rect x="86" y="90" width="12" height="40" rx="6" fill="#c084fc" />
            </svg>
          </div>
        </div>

        <div className="mt-32">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            Manage your<br />team better.
          </h1>
        </div>

        <div>
          <Link
            href="/register"
            className="block w-full bg-gradient-to-r from-primary-500 to-primary-400 text-white text-center py-3.5 rounded-full font-semibold text-sm hover:from-primary-600 hover:to-primary-500 transition-all"
          >
            Get Started
          </Link>
          <p className="text-center text-xs text-gray-500 mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary-600 font-semibold hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
