"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useState } from "react"
import { DocsSidebarToggle } from "@/components/docs/DocsSidebar"

const DocsSidebar = dynamic(
  () => import("@/components/docs/DocsSidebar").then((m) => m.DocsSidebar),
  { ssr: false }
)

export interface DocsLayoutProps {
  children: React.ReactNode
  prev?: { label: string; href: string }
  next?: { label: string; href: string }
}

export function DocsLayout({ children, prev, next }: DocsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 h-14 border-b border-gray-100 bg-white flex items-center px-4 gap-3 shrink-0">
        <DocsSidebarToggle onClick={() => setSidebarOpen(true)} />

        <Link href="/" className="flex items-center gap-2 mr-auto" aria-label="NestFleet home">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white text-xs">⚡</span>
          <span className="text-[15px] font-bold tracking-tight text-gray-900">NestFleet</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 leading-none">
            Docs
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Header actions">
          <Link
            href="/login"
            className="text-sm text-gray-500 hover:text-gray-900 font-medium px-3 py-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            Back to console
          </Link>
          <Link
            href="/signup"
            className="text-sm text-white font-semibold px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            Get started free
          </Link>
        </nav>
      </header>

      {/* ── Body ────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <DocsSidebar
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 min-w-0">
          <div className="max-w-3xl px-8 py-10 mx-0">
            {children}

            {/* ── Prev / Next ──────────────────────────────── */}
            {(prev || next) && (
              <nav
                aria-label="Page navigation"
                className="mt-16 pt-6 border-t border-gray-100 flex items-center justify-between gap-4"
              >
                {prev ? (
                  <Link
                    href={prev.href}
                    className="group flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                    <span className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-indigo-400">Previous</span>
                      <span className="font-medium">{prev.label}</span>
                    </span>
                  </Link>
                ) : <span />}

                {next ? (
                  <Link
                    href={next.href}
                    className="group flex items-center gap-2 text-sm text-gray-500 hover:text-indigo-600 transition-colors text-right ml-auto"
                  >
                    <span className="flex flex-col items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-indigo-400">Next</span>
                      <span className="font-medium">{next.label}</span>
                    </span>
                    <svg className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                ) : <span />}
              </nav>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
