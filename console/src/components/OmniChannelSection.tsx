// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useRef, useEffect, useState } from "react";

const INBOUND = [
  {
    icon: "📧",
    label: "Email",
    desc: "Support requests, bug reports, questions",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    dot:   "bg-blue-500",
  },
  {
    icon: "💬",
    label: "Telegram",
    desc: "Async updates, founder & team channels",
    color: "bg-sky-50 border-sky-200 text-sky-700",
    dot:   "bg-sky-500",
  },
  {
    icon: "🐙",
    label: "GitHub",
    desc: "Issues, PR events, webhooks",
    color: "bg-gray-50 border-gray-200 text-gray-700",
    dot:   "bg-gray-600",
  },
  {
    icon: "🔌",
    label: "Webhooks",
    desc: "Any internal system or third-party tool",
    color: "bg-violet-50 border-violet-200 text-violet-700",
    dot:   "bg-violet-500",
  },
];

const OUTBOUND = [
  {
    icon: "📧",
    label: "Email reply",
    desc: "Workarounds, status, resolution",
    color: "bg-blue-50 border-blue-200 text-blue-700",
  },
  {
    icon: "💬",
    label: "Telegram",
    desc: "Approval requests, escalations, digests",
    color: "bg-sky-50 border-sky-200 text-sky-700",
  },
  {
    icon: "📋",
    label: "GitHub PR / Issues",
    desc: "Drafted artifacts, linked changes",
    color: "bg-gray-50 border-gray-200 text-gray-700",
  },
  {
    icon: "🔔",
    label: "Notifications",
    desc: "Leads alerted at every decision gate",
    color: "bg-amber-50 border-amber-200 text-amber-700",
  },
];

const OUTCOMES = [
  { icon: "🛡️", label: "Zero missed signals", sub: "Every channel feeds the same AI engine" },
  { icon: "⚡", label: "Fast to market",       sub: "Bug → change request → PR in minutes, not sprints" },
  { icon: "📈", label: "Continuously improving", sub: "Every resolved case enriches your knowledge base" },
  { icon: "🎯", label: "High-quality products", sub: "Systemic issues surface before they accumulate" },
];

export function OmniChannelSection() {
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
    <section ref={ref} className="py-24 px-5 sm:px-8 bg-gray-950 overflow-hidden">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className={`text-center mb-16 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70 ring-1 ring-white/20">
            OMNI-CHANNEL
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Every channel. One brain.
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-gray-400 text-lg leading-relaxed">
            Wherever your users reach you — email, Telegram, GitHub — NestFleet is already listening.
            Every signal is normalized, triaged, and acted on. Nothing slips through the cracks.
          </p>
        </div>

        {/* Channel flow diagram */}
        <div className={`grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-center mb-16 transition-all duration-700 delay-100 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>

          {/* Inbound */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Signals In</p>
            {INBOUND.map((ch, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl border bg-opacity-10 px-4 py-3 ${ch.color} transition-all duration-300 hover:-translate-x-1`}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <span className="text-xl">{ch.icon}</span>
                <div>
                  <p className="text-sm font-bold">{ch.label}</p>
                  <p className="text-xs opacity-70">{ch.desc}</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${ch.dot} animate-pulse`} />
                  <svg className="h-4 w-4 opacity-40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {/* Centre hub */}
          <div className="flex justify-center">
            <div className="relative flex flex-col items-center gap-2">
              {/* Glow */}
              <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-2xl scale-150 pointer-events-none" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600 shadow-2xl shadow-indigo-500/40 ring-4 ring-indigo-500/30">
                <span className="text-3xl">⚡</span>
              </div>
              <p className="text-xs font-bold text-white/60 uppercase tracking-wider">NestFleet</p>
              {/* Pulse rings */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-24 w-24 rounded-full border border-indigo-500/20 animate-ping" style={{ animationDuration: "2s" }} />
              </div>
            </div>
          </div>

          {/* Outbound */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 lg:text-right">Actions Out</p>
            {OUTBOUND.map((ch, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl border bg-opacity-10 px-4 py-3 ${ch.color} transition-all duration-300 hover:translate-x-1`}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <svg className="h-4 w-4 opacity-40 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-bold">{ch.label}</p>
                  <p className="text-xs opacity-70">{ch.desc}</p>
                </div>
                <span className="text-xl">{ch.icon}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Outcomes grid */}
        <div className={`grid sm:grid-cols-2 lg:grid-cols-4 gap-5 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {OUTCOMES.map((o, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/8 transition-colors"
            >
              <div className="mb-3 text-2xl">{o.icon}</div>
              <h4 className="text-sm font-bold text-white mb-1">{o.label}</h4>
              <p className="text-xs text-gray-400 leading-relaxed">{o.sub}</p>
            </div>
          ))}
        </div>

        {/* Notification control plane callout */}
        <div className={`mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5 transition-all duration-700 delay-300 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-2xl">
            🔔
          </div>
          <div className="flex-1">
            <h4 className="text-base font-bold text-white mb-1">Notification control plane — built in, not bolted on</h4>
            <p className="text-sm text-gray-400 leading-relaxed">
              Priority queues, quiet hours, ack deadlines, and escalation chains are first-class features.
              <span className="text-amber-400 font-medium"> Critical alerts bypass quiet hours.</span>{" "}
              Digest summaries keep leads informed without pager fatigue.
              Notifications are operational control signals — not cosmetic UI noise.
            </p>
          </div>
          <div className="shrink-0 flex flex-wrap gap-2">
            {["critical", "high", "normal", "low"].map((p) => (
              <span key={p} className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                p === "critical" ? "bg-red-500/20 text-red-400" :
                p === "high"     ? "bg-amber-500/20 text-amber-400" :
                p === "normal"   ? "bg-blue-500/20 text-blue-400" :
                                   "bg-gray-500/20 text-gray-400"
              }`}>
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
