// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useRef, useEffect } from "react";

// ── Team Roles (maps 1:1 to app RBAC roles) ─────────────────────────────────

const TEAM_ROLES = [
  {
    role:     "admin",
    name:     "Administrator",
    emoji:    "🛡️",
    color:    "gray",
    desc:     "Full platform management — users, settings, license, integrations",
    examples: ["User management", "LLM configuration", "License control"],
  },
  {
    role:     "operator",
    name:     "Operator",
    emoji:    "🖥️",
    color:    "indigo",
    desc:     "Day-to-day console — views cases, drafts clarifications, monitors notifications",
    examples: ["Case monitoring", "Draft clarifications", "View analytics"],
  },
  {
    role:     "support_lead",
    name:     "Support Lead",
    emoji:    "💬",
    color:    "blue",
    desc:     "Owns the case lifecycle — triage, resolve, escalate, approve communications",
    examples: ["Manual triage", "Case resolution", "Outage acknowledgement"],
  },
  {
    role:     "change_lead",
    name:     "Change Lead",
    emoji:    "⚙️",
    color:    "orange",
    desc:     "Reviews change requests, approves or rejects, completes PR drafts",
    examples: ["CR approval gate", "PR review", "Risk acceptance"],
  },
  {
    role:     "product_lead",
    name:     "Product Lead",
    emoji:    "🎯",
    color:    "emerald",
    desc:     "Approves high-impact changes, sets priorities, triages escalations",
    examples: ["Roadmap impact", "Severity override", "CR approval"],
  },
  {
    role:     "knowledge_lead",
    name:     "Knowledge Lead",
    emoji:    "📚",
    color:    "purple",
    desc:     "Manages product memory — docs, FAQs, runbooks, knowledge quality",
    examples: ["Memory sources", "Conflict resolution", "FAQ accuracy"],
  },
];

// ── RBAC Matrix (mirrors permissions.ts exactly) ─────────────────────────────

const FEATURES_LIST = ["Cases", "Queue", "PR Drafts", "Notifications", "Analytics", "Settings", "Users"];

const RBAC_MATRIX: Record<string, Record<string, "full" | "read" | "none">> = {
  admin:          { Cases: "full", Queue: "full", "PR Drafts": "full", Notifications: "full", Analytics: "full", Settings: "full", Users: "full" },
  operator:       { Cases: "full", Queue: "none", "PR Drafts": "full", Notifications: "full", Analytics: "full", Settings: "read", Users: "none" },
  support_lead:   { Cases: "full", Queue: "none", "PR Drafts": "full", Notifications: "full", Analytics: "none", Settings: "none", Users: "none" },
  change_lead:    { Cases: "full", Queue: "full", "PR Drafts": "full", Notifications: "full", Analytics: "none", Settings: "none", Users: "none" },
  product_lead:   { Cases: "full", Queue: "full", "PR Drafts": "full", Notifications: "full", Analytics: "none", Settings: "none", Users: "none" },
  knowledge_lead: { Cases: "read", Queue: "none", "PR Drafts": "none", Notifications: "full", Analytics: "none", Settings: "none", Users: "none" },
};

// ── AI Agents (background automation, not user roles) ────────────────────────

const AI_AGENTS = [
  {
    name:  "Frontline Agent",
    emoji: "📡",
    color: "indigo",
    what:  "Intake & enrichment",
    does:  "Ingests signals, normalizes conversations, asks clarifying questions, routes to triage",
  },
  {
    name:  "Steward Agent",
    emoji: "🧭",
    color: "violet",
    what:  "Triage & routing",
    does:  "Classifies severity and type, matches known issues, decides auto-resolve vs escalate",
  },
  {
    name:  "Change Agent",
    emoji: "🔧",
    color: "amber",
    what:  "Engineering & PR drafting",
    does:  "Creates change requests, drafts GitHub PRs, links signals to code changes",
  },
];

// ── Color tokens ─────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { border: string; icon: string; tag: string }> = {
  gray:    { border: "border-gray-200 hover:border-gray-300",     icon: "bg-gray-100 text-gray-600",    tag: "bg-gray-100 text-gray-600" },
  indigo:  { border: "border-indigo-200 hover:border-indigo-300", icon: "bg-indigo-50 text-indigo-600", tag: "bg-indigo-50 text-indigo-700" },
  blue:    { border: "border-blue-200 hover:border-blue-300",     icon: "bg-blue-50 text-blue-600",     tag: "bg-blue-50 text-blue-700" },
  orange:  { border: "border-orange-200 hover:border-orange-300", icon: "bg-orange-50 text-orange-600", tag: "bg-orange-50 text-orange-700" },
  emerald: { border: "border-emerald-200 hover:border-emerald-300", icon: "bg-emerald-50 text-emerald-600", tag: "bg-emerald-50 text-emerald-700" },
  purple:  { border: "border-purple-200 hover:border-purple-300", icon: "bg-purple-50 text-purple-600", tag: "bg-purple-50 text-purple-700" },
};

const AGENT_COLORS: Record<string, { bg: string; ring: string; icon: string; dot: string }> = {
  indigo: { bg: "bg-indigo-50", ring: "ring-indigo-200", icon: "bg-indigo-100 text-indigo-600", dot: "bg-indigo-500" },
  violet: { bg: "bg-violet-50", ring: "ring-violet-200", icon: "bg-violet-100 text-violet-600", dot: "bg-violet-500" },
  amber:  { bg: "bg-amber-50",  ring: "ring-amber-200",  icon: "bg-amber-100 text-amber-600",  dot: "bg-amber-500" },
};

// ── Component ────────────────────────────────────────────────────────────────

export function PersonasSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-24 px-5 sm:px-8 bg-white">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className={`text-center mb-14 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
            ROLES & AGENTS
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Your team + AI agents, working together.
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-gray-500 text-lg leading-relaxed">
            Six human roles with granular permissions. Three AI agents that handle the work.
            One founder can hold all roles — or split them across your team.
          </p>
        </div>

        {/* ── Team Roles (6 cards) ───────────────────────────────────────── */}
        <div className={`mb-10 transition-all duration-700 delay-100 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
            Your team — 6 roles, granular permissions
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEAM_ROLES.map((role) => {
              const c = ROLE_COLORS[role.color];
              return (
                <div
                  key={role.role}
                  className={`rounded-xl border bg-white p-5 transition-all duration-300 ${c.border} hover:shadow-md hover:-translate-y-0.5`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${c.icon}`}>
                      {role.emoji}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{role.name}</h4>
                      <code className="text-[10px] text-gray-400 font-mono">{role.role}</code>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">{role.desc}</p>
                  <div className="flex flex-wrap gap-1">
                    {role.examples.map((ex, j) => (
                      <span key={j} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.tag}`}>
                        {ex}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RBAC Matrix ────────────────────────────────────────────────── */}
        <div className={`mb-10 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
            Feature access by role
          </p>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-semibold text-gray-500 w-36">Role</th>
                    {FEATURES_LIST.map((f) => (
                      <th key={f} className="text-center px-3 py-3 font-semibold text-gray-500">{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {TEAM_ROLES.map((role) => {
                    const access = RBAC_MATRIX[role.role];
                    return (
                      <tr key={role.role} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{role.emoji}</span>
                            <span className="font-medium text-gray-700">{role.name}</span>
                          </div>
                        </td>
                        {FEATURES_LIST.map((f) => {
                          const level = access?.[f] ?? "none";
                          return (
                            <td key={f} className="text-center px-3 py-2.5">
                              {level === "full" && (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                </span>
                              )}
                              {level === "read" && (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-blue-600" title="Read-only">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                </span>
                              )}
                              {level === "none" && (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-300">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full bg-emerald-100" /> Full access
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full bg-blue-100" /> Read-only
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full bg-gray-100" /> No access
              </span>
              <span className="ml-auto">Roles are composable — assign multiple roles per user</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={`flex items-center gap-4 my-8 transition-all duration-700 delay-250 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex-1 border-t border-dashed border-gray-200" />
          <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 shadow-xs">
            <svg className="h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="text-xs font-semibold text-gray-600">AI agents work behind the scenes</span>
          </div>
          <div className="flex-1 border-t border-dashed border-gray-200" />
        </div>

        {/* ── AI Agents (compact row) ────────────────────────────────────── */}
        <div className={`transition-all duration-700 delay-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">
            AI Agents — autonomous background workers
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {AI_AGENTS.map((agent) => {
              const c = AGENT_COLORS[agent.color];
              return (
                <div key={agent.name} className={`rounded-xl ${c.bg} ring-1 ${c.ring} p-5`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${c.icon}`}>
                      {agent.emoji}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{agent.name}</h4>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase">{agent.what}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{agent.does}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-gray-400">
            Agents propose actions. Humans approve consequential decisions. Every action is typed, validated, and auditable.
          </p>
        </div>

        {/* Footnote */}
        <p className={`mt-8 text-center text-sm text-gray-400 transition-all duration-700 delay-400 ${visible ? "opacity-100" : "opacity-0"}`}>
          Solo founder? One person holds all six roles. Growing team? Split them — no platform reconfiguration.
        </p>
      </div>
    </section>
  );
}
