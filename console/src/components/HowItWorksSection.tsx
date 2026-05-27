// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useEffect, useRef } from "react";

interface Step {
  number: number;
  label:  string;
  title:  string;
  description: string;
  bullets: string[];
  visual: React.ReactNode;
}

function SignalVisual() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 bg-gray-50 border-b border-gray-100 px-4 py-2.5">
        <div className="flex gap-1">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <span className="text-xs text-gray-400 font-mono ml-1">inbound · email</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm">📧</div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-[11px] text-gray-400">From: alice@acme.io</p>
            <p className="text-sm font-semibold text-gray-900">Export pipeline keeps timing out</p>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed pl-11">
          "Hi, I've been trying to export 847 documents for 2 hours and it keeps failing with a timeout after ~5 minutes. This is blocking our end-of-quarter report..."
        </p>
        <div className="pl-11 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-200">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Received · processing…
          </span>
        </div>
      </div>
    </div>
  );
}

function TriageVisual() {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-950 shadow-sm overflow-hidden font-mono">
      <div className="flex items-center gap-2 bg-gray-900 border-b border-gray-800 px-4 py-2.5">
        <div className="flex gap-1">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
        </div>
        <span className="text-xs text-gray-500 ml-1">triage agent · output</span>
        <span className="ml-auto text-[10px] text-emerald-400 font-medium">⚡ 1.2s</span>
      </div>
      <div className="p-4 text-xs leading-6 space-y-0.5">
        <p><span className="text-gray-500">{"{"}</span></p>
        <p className="pl-4"><span className="text-blue-400">"severity"</span><span className="text-gray-500">: </span><span className="text-amber-300">"high"</span><span className="text-gray-500">,</span></p>
        <p className="pl-4"><span className="text-blue-400">"type"</span><span className="text-gray-500">: </span><span className="text-green-400">"bug"</span><span className="text-gray-500">,</span></p>
        <p className="pl-4"><span className="text-blue-400">"labels"</span><span className="text-gray-500">: [</span><span className="text-green-400">"export"</span><span className="text-gray-500">, </span><span className="text-green-400">"timeout"</span><span className="text-gray-500">],</span></p>
        <p className="pl-4"><span className="text-blue-400">"confidence"</span><span className="text-gray-500">: </span><span className="text-purple-400">0.95</span><span className="text-gray-500">,</span></p>
        <p className="pl-4"><span className="text-blue-400">"routing"</span><span className="text-gray-500">: </span><span className="text-green-400">"Engineering (ISSUE-441)"</span></p>
        <p><span className="text-gray-500">{"}"}</span></p>
      </div>
    </div>
  );
}

function RoutingVisual() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 bg-gray-50 border-b border-gray-100 px-4 py-2.5">
        <span className="text-xs text-gray-400 font-mono">steward · routing decision</span>
      </div>
      <div className="p-4 space-y-4">
        {/* Match result */}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-semibold text-emerald-800">Known issue matched</span>
          </div>
          <p className="text-xs text-emerald-700 font-medium pl-6">"Export timeout on large document sets"</p>
          <div className="flex items-center gap-2 pl-6">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Tier 1</span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Confidence 94%</span>
          </div>
        </div>
        {/* Decision */}
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <svg className="h-4 w-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span>Auto-reply path selected</span>
        </div>
        <p className="text-xs text-gray-500 pl-6 leading-relaxed">
          Workaround: split export into batches of ≤ 50 documents per request.
        </p>
      </div>
    </div>
  );
}

function ResolutionVisual() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between bg-emerald-50 border-b border-emerald-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-semibold text-emerald-800">Case resolved</span>
        </div>
        <span className="text-xs text-gray-400 font-mono">3.8s total</span>
      </div>
      <div className="p-4 space-y-2.5">
        {[
          { label: "Signal ingested",    time: "0.0s", done: true },
          { label: "AI triage complete", time: "1.2s", done: true },
          { label: "Known issue matched",time: "2.1s", done: true },
          { label: "Auto-reply sent",    time: "3.8s", done: true },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="h-3 w-3 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            </div>
            <span className="flex-1 text-xs text-gray-700">{item.label}</span>
            <span className="text-[11px] font-mono text-gray-400">{item.time}</span>
          </div>
        ))}
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">No human intervention required</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">autonomous ✓</span>
        </div>
      </div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    number: 1,
    label: "Signal",
    title: "Every inbound captured instantly",
    description:
      "Email, webhooks, Telegram — NestFleet ingests every signal the moment it arrives. No polling, no missed messages, no manual intake.",
    bullets: [
      "Email webhooks with full threading support",
      "GitHub issues and PR events",
      "Instant case creation with deduplication",
    ],
    visual: <SignalVisual />,
  },
  {
    number: 2,
    label: "Triage",
    title: "AI classifies in under 2 seconds",
    description:
      "Our triage agent reads the signal, scores severity, assigns type and labels, and determines routing team — consistently, at any volume.",
    bullets: [
      "Severity, type, and confidence scoring",
      "Structured labels for downstream agents",
      "Full reasoning trace stored for audit",
    ],
    visual: <TriageVisual />,
  },
  {
    number: 3,
    label: "Route",
    title: "Matched or escalated intelligently",
    description:
      "Known issue? Auto-reply drafted from your runbook. Novel bug? Change prep kicks off. Question? FAQ matched and sent. No engineer required.",
    bullets: [
      "Vector search against your knowledge base",
      "Confidence thresholds you control",
      "Escalate to human at any confidence level",
    ],
    visual: <RoutingVisual />,
  },
  {
    number: 4,
    label: "Resolve",
    title: "Closed — with a full audit trail",
    description:
      "Whether auto-replied, PR-drafted, or escalated, every case closes with a complete lineage. Every decision, every agent run, every human action — immutable.",
    bullets: [
      "Per-case lineage timeline in the console",
      "Agent model, tokens, duration recorded",
      "Human overrides and escalations logged",
    ],
    visual: <ResolutionVisual />,
  },
];

const STEP_DURATION_MS = 5000;
const TICK_MS = 50;

interface LifecycleStep { icon: string; label: string }

export function HowItWorksSection({ lifecycle }: { lifecycle?: LifecycleStep[] }) {
  const [active, setActive]       = useState(0);
  const [progress, setProgress]   = useState(0);
  const [paused, setPaused]       = useState(false);
  const [visible, setVisible]     = useState(false);
  const [contentKey, setKey]      = useState(0);
  const sectionRef                = useRef<HTMLDivElement>(null);

  // Scroll-triggered visibility
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-advance timer
  useEffect(() => {
    if (paused) return;
    let elapsed = 0;
    const interval = setInterval(() => {
      if (paused) return;
      elapsed += TICK_MS;
      setProgress(Math.min((elapsed / STEP_DURATION_MS) * 100, 100));
      if (elapsed >= STEP_DURATION_MS) {
        elapsed = 0;
        setProgress(0);
        setActive((a) => (a + 1) % STEPS.length);
        setKey((k) => k + 1);
      }
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [paused, active]);

  function goTo(idx: number) {
    setActive(idx);
    setProgress(0);
    setKey((k) => k + 1);
  }

  const step = STEPS[active];

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="py-24 px-5 sm:px-8 bg-gray-50"
    >
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div
          className={`text-center mb-14 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
            HOW IT WORKS
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            From inbox to resolved in seconds.
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-gray-500 text-lg leading-relaxed">
            Four autonomous steps. Zero context switching.
          </p>
        </div>

        {/* Lifecycle flow (merged from standalone section) */}
        {lifecycle && lifecycle.length > 0 && (
          <div className={`mb-12 transition-all duration-700 delay-75 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            <div className="overflow-x-auto pb-2">
              <div className="flex items-start justify-center gap-2 sm:gap-3 min-w-max mx-auto">
                {lifecycle.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 sm:gap-3">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm text-lg hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-default">
                        {step.icon}
                      </div>
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-center">
                        {step.label}
                      </span>
                    </div>
                    {i < lifecycle.length - 1 && (
                      <svg className="h-3 w-3 text-gray-300 shrink-0 -mt-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step indicators */}
        <div
          className={`flex items-center justify-center gap-0 mb-12 transition-all duration-700 delay-100 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center">
              <button
                onClick={() => goTo(i)}
                className={`flex flex-col items-center gap-1.5 group transition-all duration-200 focus:outline-none`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300 ${
                    i === active
                      ? "border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-200"
                      : i < active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-400"
                      : "border-gray-200 bg-white text-gray-400 group-hover:border-indigo-300"
                  }`}
                >
                  {i < active ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    s.number
                  )}
                </div>
                <span
                  className={`text-xs font-semibold transition-colors ${
                    i === active ? "text-indigo-600" : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="w-16 sm:w-24 mx-1 h-0.5 bg-gray-200 relative overflow-hidden -mt-4">
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-400 transition-all duration-100"
                    style={{ width: i < active ? "100%" : i === active ? `${progress}%` : "0%" }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Content panel */}
        <div
          className={`grid md:grid-cols-2 gap-10 items-center transition-all duration-700 delay-200 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Text */}
          <div
            key={`text-${contentKey}`}
            className="space-y-5 animate-how-it-works-fade"
          >
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-200 mb-3">
                Step {step.number} · {step.label}
              </span>
              <h3 className="text-2xl font-bold text-gray-900 leading-snug">
                {step.title}
              </h3>
            </div>
            <p className="text-gray-500 leading-relaxed">{step.description}</p>
            <ul className="space-y-2.5">
              {step.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="h-4 w-4 mt-0.5 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
            {/* Progress bar */}
            <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Visual */}
          <div
            key={`visual-${contentKey}`}
            className="animate-how-it-works-fade"
          >
            {step.visual}
          </div>
        </div>
      </div>
    </section>
  );
}
