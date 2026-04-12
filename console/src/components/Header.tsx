// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useAuth } from "@/lib/auth";

interface HeaderProps {
  onMenuToggle: () => void;
  isMobileMenuOpen: boolean;
}

export function Header({ onMenuToggle, isMobileMenuOpen }: HeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200 shrink-0">
      {/* Left: Hamburger (mobile) + Logo */}
      <div className="flex items-center gap-3">
        {/* Mobile menu toggle */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">
            NestFleet Console
          </span>
        </div>
      </div>

      {/* Right: User info + Logout */}
      {user && (
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 select-none">
              {user.email.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-gray-600 max-w-[200px] truncate">
              {user.email}
            </span>
            {user.roles?.[0] && (
              <span className="text-xs text-gray-400 hidden md:inline">
                ({user.roles[0]})
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      )}
    </header>
  );
}
