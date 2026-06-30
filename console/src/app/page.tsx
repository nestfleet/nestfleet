// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

export const metadata: Metadata = {
  title: "NestFleet — AI-native product operations platform",
  description:
    "Open-source, self-hosted product operations. NestFleet handles support intake, triage, change management, and AI-assisted replies for your product. Free under AGPL-3.0.",
  openGraph: {
    title: "NestFleet — AI-native product operations platform",
    description:
      "Open-source and self-hosted. AI-driven triage, auto-reply, change management, and living knowledge base for your product. Free under AGPL-3.0.",
    url: "https://nestfleet.dev",
    siteName: "NestFleet",
    type: "website",
    images: [{ url: "https://nestfleet.dev/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "NestFleet — AI-native product operations platform",
    description:
      "Open-source and self-hosted. AI-driven triage, auto-reply, and change management. Free under AGPL-3.0.",
    images: ["https://nestfleet.dev/og-image.png"],
  },
  alternates: { canonical: "https://nestfleet.dev" },
};
import { ZoomOnScroll }     from "@/components/ZoomOnScroll";
import { LandingNav }       from "@/components/LandingNav";
import { HeroDemoCard }     from "@/components/HeroDemoCard";
import { HowItWorksSection }from "@/components/HowItWorksSection";
import { OmniChannelSection }from "@/components/OmniChannelSection";
import { PersonasSection }  from "@/components/PersonasSection";
import { ComplianceSection }from "@/components/ComplianceSection";
import { PricingSection }   from "@/components/PricingSection";
import { LandingFAQ }       from "@/components/LandingFAQ";

// ── Feature bento — 6 cards ────────────────────────────────────────────────

const FEATURES = [
  {
    icon:  "⚡",
    title: "Instant AI Triage",
    description:
      "Every signal classified in under 2 seconds — severity, type, labels, confidence, routing team. No queue saturation. No human bottleneck.",
    accent: "indigo",
  },
  {
    icon:  "🔍",
    title: "Known Issue Matching",
    description:
      "Vector similarity search against your runbooks, FAQs, and past cases. Tier-ranked results feed the auto-reply or routing decision directly.",
    accent: "indigo",
  },
  {
    icon:  "✉️",
    title: "Autonomous Auto-Reply",
    description:
      "High-confidence cases resolved with a workaround or documentation link — drafted, sent, and closed. No human in the loop required.",
    accent: "emerald",
  },
  {
    icon:  "🔧",
    title: "AI Change Management",
    description:
      "Novel bugs go from report to risk-assessed change request in one agent step. Affected surfaces, recommended approver, GitHub PR artifact — all structured.",
    accent: "emerald",
  },
  {
    icon:  "🧠",
    title: "Living Knowledge Base",
    description:
      "Every resolved case automatically proposes FAQ entries, known-issue records, and runbook updates. Your product gets smarter with every closed ticket.",
    accent: "violet",
  },
  {
    icon:  "🎛️",
    title: "Governed Automation",
    description:
      "T0–T5 action tiers with schema validation, policy engine, and secondary validator on every proposal. Abstain-and-escalate when confidence is low. No black-box commits.",
    accent: "violet",
  },
  {
    icon:  "📊",
    title: "Analytics & Cost Control",
    description:
      "Real-time dashboard with token costs per model, agent success rates, case resolution trends, and operational metrics. Know your automation ROI at a glance.",
    accent: "indigo",
  },
  {
    icon:  "✅",
    title: "Approval Workflows",
    description:
      "Change requests routed to the right lead with full context. Approve or reject with rationale. Rejection notifies support. Full audit trail for compliance.",
    accent: "emerald",
  },
  {
    icon:  "👥",
    title: "Team & Roles",
    description:
      "Six built-in roles — Admin, Operator, Support Lead, Change Lead, Product Lead, Knowledge Lead. Granular permissions per feature. Compose roles per team size.",
    accent: "violet",
  },
];

const ACCENT: Record<string, { border: string; icon: string }> = {
  indigo: { border: "hover:border-indigo-200", icon: "bg-indigo-50 text-indigo-600"  },
  emerald:{ border: "hover:border-emerald-200",icon: "bg-emerald-50 text-emerald-600"},
  violet: { border: "hover:border-violet-200", icon: "bg-violet-50 text-violet-600"  },
};

// ── Lifecycle flow ─────────────────────────────────────────────────────────

const LIFECYCLE = [
  { icon: "📡", label: "Signal"      },
  { icon: "💬", label: "Conversation" },
  { icon: "📋", label: "Case"        },
  { icon: "🔎", label: "Problem"     },
  { icon: "🔧", label: "Change"      },
  { icon: "🚀", label: "Release"     },
  { icon: "✅", label: "Verification" },
  { icon: "📚", label: "Knowledge"   },
];

// ── Integrations ───────────────────────────────────────────────────────────
// status: "live" | "coming"
// To activate: change "coming" → "live". The badge and opacity update automatically.

const INTEGRATIONS = [
  // ── Live ──────────────────────────────────────────────────────────────────
  {
    name:     "GitHub",
    icon:     "🐙",
    category: "Engineering",
    desc:     "Issues, PR drafts, webhooks",
    status:   "live" as const,
  },
  {
    name:     "Email",
    icon:     "📧",
    category: "Communication",
    desc:     "Inbound + outbound via any SMTP / Postmark",
    status:   "live" as const,
  },
  {
    name:     "Telegram",
    icon:     "💬",
    category: "Communication",
    desc:     "Team channels and async updates",
    status:   "live" as const,
  },
  {
    name:     "CI Webhooks",
    icon:     "🔄",
    category: "Engineering",
    desc:     "PR merge → CI status → deploy tracking",
    status:   "live" as const,
  },
  // ── Coming ────────────────────────────────────────────────────────────────
  {
    name:     "Jira",
    icon:     "🔵",
    category: "Work management",
    desc:     "Issues, sprints, project sync",
    status:   "coming" as const,
  },
  {
    name:     "Asana",
    icon:     "🟧",
    category: "Work management",
    desc:     "Tasks, projects, team workspaces",
    status:   "coming" as const,
  },
  {
    name:     "Linear",
    icon:     "⬡",
    category: "Work management",
    desc:     "Issues, cycles, roadmap sync",
    status:   "coming" as const,
  },
  {
    name:     "Confluence",
    icon:     "📘",
    category: "Knowledge",
    desc:     "Docs, runbooks, knowledge base",
    status:   "coming" as const,
  },
  {
    name:     "Notion",
    icon:     "⬜",
    category: "Knowledge",
    desc:     "Pages, wikis, project docs",
    status:   "coming" as const,
  },
  {
    name:     "Slack",
    icon:     "💼",
    category: "Communication",
    desc:     "Alerts, approvals, digest delivery",
    status:   "coming" as const,
  },
];

function IntegrationsSection() {
  const liveCount    = INTEGRATIONS.filter((i) => i.status === "live").length;
  const comingCount  = INTEGRATIONS.filter((i) => i.status === "coming").length;

  // Group by category for the label row
  const categories   = [...new Set(INTEGRATIONS.map((i) => i.category))];

  return (
    <section id="integrations" className="py-20 px-5 sm:px-8 bg-white border-t border-gray-100">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
              INTEGRATIONS
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Works with your stack.
            </h2>
            <p className="mt-2 text-gray-500 text-base leading-relaxed max-w-lg">
              Connect the tools your team already uses. Connector-based — each product
              enables only what it actually needs.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {liveCount} live
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              {comingCount} coming
            </span>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
          {/* Category groups */}
          {categories.map((cat) => {
            const items = INTEGRATIONS.filter((i) => i.category === cat);
            return (
              <div key={cat} className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 pl-1">
                  {cat}
                </p>
                {items.map((intg) => (
                  <div
                    key={intg.name}
                    className={`relative flex items-center gap-3 rounded-xl border bg-white p-4 transition-all duration-200 ${
                      intg.status === "live"
                        ? "border-gray-200 shadow-xs hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-200"
                        : "border-gray-100 opacity-60"
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${
                      intg.status === "live" ? "bg-gray-100" : "bg-gray-50"
                    }`}>
                      {intg.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900 truncate">{intg.name}</p>
                        {intg.status === "live" ? (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Live
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
                            Soon
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{intg.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footnote */}
        <p className="mt-8 text-center text-sm text-gray-400">
          Connector-based architecture — each product enables only what it needs. No bloatware.
          {" "}
          <a href="mailto:hello@nestfleet.dev" className="text-indigo-500 hover:underline">
            Request an integration →
          </a>
        </p>
      </div>
    </section>
  );
}

// ── Stats ──────────────────────────────────────────────────────────────────

const STATS = [
  { value: "< 2s",  label: "Average triage time"   },
  { value: "AGPL",  label: "Open source, always"   },
  { value: "100%",  label: "Audit trail coverage"  },
  { value: "0",     label: "Missed signals"        },
];

// ── Graph mock helpers ────────────────────────────────────────────────────

const GRAPH_COLORS: Record<string, { bg: string; ring: string; text: string }> = {
  blue:    { bg: "bg-blue-50",    ring: "ring-blue-200",    text: "text-blue-700" },
  indigo:  { bg: "bg-indigo-50",  ring: "ring-indigo-200",  text: "text-indigo-700" },
  violet:  { bg: "bg-violet-50",  ring: "ring-violet-200",  text: "text-violet-700" },
  amber:   { bg: "bg-amber-50",   ring: "ring-amber-200",   text: "text-amber-700" },
  emerald: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700" },
};

function GraphNode({ emoji, label, color, status, badge }: { emoji: string; label: string; color: string; status: string; badge?: string }) {
  const c = GRAPH_COLORS[color] ?? GRAPH_COLORS.indigo;
  return (
    <div className={`relative flex items-center gap-2 rounded-xl ${c.bg} ring-1 ${c.ring} px-3 py-2 shadow-xs`}>
      <span className="text-base">{emoji}</span>
      <div className="min-w-0">
        <p className={`text-[11px] font-semibold ${c.text} whitespace-nowrap`}>{label}</p>
      </div>
      {status === "completed" && (
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg className="h-2 w-2" fill="none" viewBox="0 0 24 24" strokeWidth={4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        </span>
      )}
      {badge && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-bold text-gray-500 ring-1 ring-gray-200 whitespace-nowrap">
          {badge}
        </span>
      )}
    </div>
  );
}

function GraphArrow() {
  return (
    <svg className="h-3 w-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ── Self-Hosted section data ──────────────────────────────────────────────

const PRIVACY_POINTS = [
  { icon: "🏠", title: "Your infrastructure", desc: "Deploy on Kubernetes, Docker, or bare metal. Your PostgreSQL, your object storage, your rules." },
  { icon: "🔑", title: "Your LLM credentials", desc: "Bring your own API keys — OpenAI, Anthropic, Gemini, or self-hosted Ollama. We never proxy your calls." },
  { icon: "🗑️", title: "Your retention policy", desc: "Configure per-product retention windows. Auto-delete after N days. GDPR Art. 17 erasure built in." },
  { icon: "🚫", title: "Zero cloud lock-in", desc: "No external dependencies — runs fully air-gapped if needed. No telemetry, no phone-home, no vendor lock-in. Your data never leaves your infra." },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function HomePage() {
  if (process.env.NEXT_PUBLIC_SHOW_LANDING !== "true") {
    redirect("/login")
  }

  return (
    <div className="bg-white text-gray-900 antialiased">
      <LandingNav />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        {/* /srgb keeps v3's sRGB interpolation; v4 defaults to OKLab which washes out this faint via-white tint */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br/srgb from-indigo-50/70 via-white to-amber-50/30" />
        <div className="pointer-events-none absolute top-0 right-0 w-[700px] h-[700px] rounded-full bg-indigo-100/25 blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-amber-50/50 blur-3xl translate-y-1/3 -translate-x-1/4" />

        <div className="relative mx-auto max-w-6xl w-full px-5 sm:px-8 py-24 grid lg:grid-cols-2 gap-14 items-center">
          {/* Left copy */}
          <div className="space-y-8">
            <div className="hero-anim-1 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Free &amp; open source · Self-host today · AGPL-3.0
            </div>

            <div className="hero-anim-2">
              <h1 className="text-5xl sm:text-[3.75rem] font-extrabold leading-[1.07] tracking-tight text-gray-900">
                The AI ops layer
                <br />
                <span className="text-indigo-600">for product‑led</span>
                <br />
                SaaS.
              </h1>
            </div>

            <p className="hero-anim-3 text-xl text-gray-500 leading-relaxed max-w-lg">
              From inbound signal to closed case — automatically.
              NestFleet triages, routes, replies, and drafts changes
              across every channel, so your team ships instead of triages.
            </p>

            {/* SDLC integration statement */}
            <div className="hero-anim-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 max-w-lg">
              <p className="text-sm text-indigo-900 leading-relaxed">
                <span className="font-bold">NestFleet sits silently inside your SDLC</span> — no new
                processes to learn, no heavy tooling to adopt. It captures every signal, keeps your
                backlog clean, and reduces the human overhead that slows software teams down. Better
                products, faster releases, lower operational cost.
              </p>
            </div>

            <div className="hero-anim-4 flex flex-wrap items-center gap-3">
              <a
                href="https://github.com/nestfleet/nestfleet#quick-start"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200/80 hover:bg-indigo-700 active:scale-95 transition-all"
              >
                Self-host free →
              </a>
              <a
                href="https://github.com/nestfleet/nestfleet"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-indigo-200 bg-white px-6 py-3.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 active:scale-95 transition-all"
              >
                View on GitHub →
              </a>
              <a
                href="#how-it-works"
                className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
              >
                See how it works ↓
              </a>
            </div>

            <div className="hero-anim-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-400">
              {["Self-hosted", "GDPR-ready", "Audit trail on every action", "OpenAI · Anthropic · Gemini"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {t}
                </span>
              ))}
              <a
                href="https://github.com/nestfleet/nestfleet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-gray-600 transition-colors"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                Star on GitHub
              </a>
            </div>
          </div>

          {/* Right — demo card */}
          <div className="hero-anim-2 flex justify-center lg:justify-end">
            <HeroDemoCard />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS (with lifecycle diagram merged in) ────────────── */}
      <HowItWorksSection lifecycle={LIFECYCLE} />

      {/* ── LINEAGE GRAPH VISUAL ───────────────────────────────────────── */}
      <section className="py-20 px-5 sm:px-8 bg-white border-t border-gray-100">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-600 ring-1 ring-violet-200">
              FULL TRACEABILITY
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              See the full lineage from signal to resolution.
            </h2>
            <p className="mt-3 text-gray-500 text-base max-w-lg mx-auto leading-relaxed">
              Every decision logged. Every action traced. Interactive graph view with clickable nodes — drill into any step of the case lifecycle.
            </p>
          </div>

          {/* Animated product demo — timeline → graph toggle → graph view */}
          <ZoomOnScroll>
            <div className="relative rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/lineage-animation.gif"
                alt="NestFleet case lineage — timeline view scrolling through nodes, then toggling to interactive graph view with 17 connected nodes"
                className="w-full h-auto"
                loading="lazy"
              />
              {/* Badge */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200 shadow-xs">
                <svg className="h-3 w-3 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                Real case from NestFleet console · Timeline + Graph views
              </div>
            </div>
          </ZoomOnScroll>
        </div>
      </section>

      {/* ── OMNI-CHANNEL ─────────────────────────────────────────────────── */}
      <OmniChannelSection />

      {/* ── PERSONAS & ROLES ─────────────────────────────────────────────── */}
      <PersonasSection />

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-5 sm:px-8 bg-gray-50">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-14">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
              FEATURES
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              Built for teams that move fast.
            </h2>
            <p className="mt-4 max-w-xl mx-auto text-gray-500 text-lg leading-relaxed">
              Every feature exists to reduce toil, not add it.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => {
              const ac = ACCENT[f.accent];
              return (
                <div
                  key={i}
                  className={`group rounded-2xl border border-gray-100 bg-white p-6 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ${ac.border}`}
                >
                  <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-xl ${ac.icon}`}>
                    {f.icon}
                  </div>
                  <h3 className="mb-2 text-base font-bold text-gray-900">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS ─────────────────────────────────────────────────── */}
      {/* To activate an integration: change status from "coming" to "live"  */}
      <IntegrationsSection />

      {/* ── SELF-HOSTED & PRIVACY-FIRST ────────────────────────────────── */}
      <section className="py-20 px-5 sm:px-8 bg-gray-50 border-t border-gray-100">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-200">
              SELF-HOSTED
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Privacy-first by architecture, not by promise.
            </h2>
            <p className="mt-3 text-gray-500 text-base max-w-lg mx-auto leading-relaxed">
              Customer data never reaches our infrastructure. You control every byte.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {PRIVACY_POINTS.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                  {p.icon}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-1">{p.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-gray-400">
            GDPR-ready · SOC 2-compatible architecture · No per-seat pricing · AGPL-3.0 open source
          </p>
        </div>
      </section>

      {/* ── STATS STRIP ──────────────────────────────────────────────────── */}
      <section className="py-16 px-5 sm:px-8 bg-indigo-600">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-10">
            {STATS.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">{s.value}</p>
                <p className="mt-2 text-sm font-medium text-indigo-200">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPLIANCE ───────────────────────────────────────────────────── */}
      <ComplianceSection />

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <PricingSection />

      {/* ── CTA BANNER ───────────────────────────────────────────────────── */}
      <section className="py-24 px-5 sm:px-8 bg-gray-50">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl bg-linear-to-br from-indigo-600 to-indigo-700 px-8 sm:px-14 py-16 shadow-2xl shadow-indigo-200 text-center">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
              Ready to stop managing
              <br />
              your queue manually?
            </h2>
            <p className="mt-5 text-indigo-200 text-lg max-w-lg mx-auto leading-relaxed">
              Self-hosted. LLM-agnostic. No per-seat surprises.
              Your PostgreSQL, your data, your control.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://github.com/nestfleet/nestfleet#quick-start"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-indigo-700 shadow-sm hover:shadow-md active:scale-95 transition-all"
              >
                Self-host free on GitHub →
              </a>
              <a
                href="#how-it-works"
                className="rounded-xl border border-indigo-400/60 px-7 py-3.5 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/30 transition-all"
              >
                See how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <LandingFAQ />

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-12 px-5 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white text-xs">⚡</span>
              <span className="font-bold text-gray-900 text-sm">NestFleet</span>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <Link href="/login"     className="hover:text-gray-900 transition-colors">Console</Link>
              <a href="#how-it-works" className="hover:text-gray-900 transition-colors">How it works</a>
              <a href="#features"      className="hover:text-gray-900 transition-colors">Features</a>
              <Link href="/docs"      className="hover:text-gray-900 transition-colors">Docs</Link>
              <a href="#integrations" className="hover:text-gray-900 transition-colors">Integrations</a>
              <a href="#pricing"      className="hover:text-gray-900 transition-colors">Pricing</a>
              <a href="#faq"          className="hover:text-gray-900 transition-colors">FAQ</a>
              <a
                href="https://github.com/nestfleet/nestfleet"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900 transition-colors"
              >
                GitHub
              </a>
              <a href="mailto:hello@nestfleet.dev" className="hover:text-gray-900 transition-colors">Contact</a>
              <Link href="/terms"   className="hover:text-gray-900 transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy</Link>
            </div>
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} NestFleet. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
