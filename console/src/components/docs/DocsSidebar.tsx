"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const NAV = [
  {
    group: "Getting Started",
    items: [
      { label: "Overview",            href: "/docs" },
      { label: "Quick Start (SaaS)",  href: "/docs/quickstart" },
      { label: "Self-Hosting",        href: "/docs/self-hosting" },
    ],
  },
  {
    group: "User Guide",
    items: [
      { label: "Cases & Triage",       href: "/docs/user-guide/cases" },
      { label: "AI Auto-Reply",        href: "/docs/user-guide/auto-reply" },
      { label: "Change Requests",      href: "/docs/user-guide/change-requests" },
      { label: "Knowledge Base",       href: "/docs/user-guide/knowledge-base" },
      { label: "Roles & Permissions",  href: "/docs/user-guide/roles" },
      { label: "Notifications",        href: "/docs/user-guide/notifications" },
      { label: "Settings & LLM",       href: "/docs/user-guide/settings" },
    ],
  },
  {
    group: "Self-Hosting",
    items: [
      { label: "Prerequisites",         href: "/docs/self-hosting/prerequisites" },
      { label: "GitHub App Setup",      href: "/docs/self-hosting/github-app" },
      { label: "Environment Variables", href: "/docs/self-hosting/environment" },
      { label: "Docker Compose",        href: "/docs/self-hosting/docker" },
      { label: "Backup & Restore",      href: "/docs/self-hosting/backup" },
      { label: "Upgrading",             href: "/docs/self-hosting/upgrading" },
    ],
  },
  {
    group: "Developer Guide",
    items: [
      { label: "Architecture",    href: "/docs/developer/architecture" },
      { label: "API Reference",   href: "/docs/developer/api-reference" },
      { label: "Contributing",    href: "/docs/developer/contributing" },
      { label: "Running Tests",   href: "/docs/developer/testing" },
    ],
  },
]

interface DocsSidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function DocsSidebar({ mobileOpen, onMobileClose }: DocsSidebarProps) {
  const pathname = usePathname()

  const activeGroups = new Set(
    NAV.filter((s) => s.items.some((i) => i.href === pathname)).map((s) => s.group)
  )

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  const isExpanded = (group: string) => {
    if (activeGroups.has(group)) return true
    return !collapsed[group]
  }

  const sidebarContent = (
    <nav
      aria-label="Docs navigation"
      className="flex flex-col gap-1 py-4 px-3 overflow-y-auto h-full"
    >
      {NAV.map((section) => {
        const expanded = isExpanded(section.group)
        const isActiveGroup = activeGroups.has(section.group)

        return (
          <div key={section.group} className="mb-1">
            <button
              onClick={() => { if (!isActiveGroup) toggleGroup(section.group) }}
              aria-expanded={expanded}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                isActiveGroup ? "cursor-default" : "hover:bg-gray-100 cursor-pointer"
              }`}
            >
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 select-none">
                {section.group}
              </span>
              {!isActiveGroup && (
                <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                  {expanded
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  }
                </svg>
              )}
            </button>

            {expanded && (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        aria-current={isActive ? "page" : undefined}
                        className={`block px-3 py-1.5 rounded text-sm transition-colors ${
                          isActive
                            ? "text-indigo-600 font-semibold bg-indigo-50"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-60 shrink-0 border-r border-gray-100 bg-white h-[calc(100vh-3.5rem)] sticky top-14 overflow-hidden"
        aria-label="Documentation sidebar"
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Docs navigation">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl flex flex-col z-50">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-900">Docs Navigation</span>
              <button
                onClick={onMobileClose}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                aria-label="Close navigation"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{sidebarContent}</div>
          </aside>
        </div>
      )}
    </>
  )
}

export function DocsSidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 rounded hover:bg-gray-100 transition-colors"
      aria-label="Open navigation menu"
    >
      <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    </button>
  )
}
