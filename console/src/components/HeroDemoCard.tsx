// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useEffect, useRef } from "react";

interface ProcessingStep {
  label: string;
  result: string;
  color: "indigo" | "emerald" | "amber";
}

interface DemoCase {
  from: string;
  subject: string;
  preview: string;
  steps: ProcessingStep[];
  outcome: string;
  outcomeTime: string;
}

const DEMO_CASES: DemoCase[] = [
  {
    from: "alice@acme.io",
    subject: "Export pipeline keeps failing with timeout",
    preview: "Hi, I've been trying to export my document collection for the past 2 hours...",
    steps: [
      { label: "Ingesting signal",      result: "email → case created",           color: "indigo" },
      { label: "AI triage",             result: "severity: high · confidence 95%", color: "indigo" },
      { label: "Known issue matched",   result: "export-timeout · Tier 1",         color: "emerald" },
      { label: "Auto-reply sent",       result: "workaround delivered",            color: "emerald" },
    ],
    outcome: "Resolved autonomously",
    outcomeTime: "3.8s",
  },
  {
    from: "admin@acmecorp.com",
    subject: "SSO login broken after latest deploy",
    preview: "Our entire team can't authenticate since the 4pm deployment. Blocking 200 users...",
    steps: [
      { label: "Ingesting signal",      result: "email → case created",             color: "indigo" },
      { label: "AI triage",             result: "severity: critical · confidence 98%", color: "indigo" },
      { label: "Bug — no known match",  result: "change prep initiated",             color: "amber"  },
      { label: "Change request created",result: "risk: high · approval requested",  color: "amber"  },
    ],
    outcome: "Change request opened",
    outcomeTime: "4.2s",
  },
  {
    from: "dev@startup.io",
    subject: "How do I configure Okta SSO integration?",
    preview: "We're trying to set up SSO for our team and can't figure out the Okta config...",
    steps: [
      { label: "Ingesting signal",      result: "email → case created",           color: "indigo" },
      { label: "AI triage",             result: "type: question · confidence 91%", color: "indigo" },
      { label: "FAQ matched",           result: "Okta SSO guide · Tier 1",         color: "emerald" },
      { label: "Auto-reply sent",       result: "documentation link delivered",    color: "emerald" },
    ],
    outcome: "Resolved autonomously",
    outcomeTime: "4.1s",
  },
];

const STEP_DELAY_MS = 900;
const CYCLE_PAUSE_MS = 2800;

const colorMap = {
  indigo: {
    dot:    "bg-indigo-500",
    badge:  "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
    check:  "text-indigo-500",
  },
  emerald: {
    dot:    "bg-emerald-500",
    badge:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    check:  "text-emerald-500",
  },
  amber: {
    dot:    "bg-amber-500",
    badge:  "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
    check:  "text-amber-500",
  },
};

export function HeroDemoCard() {
  const [caseIdx, setCaseIdx]       = useState(0);
  const [visibleSteps, setVisible]  = useState(0);
  const [done, setDone]             = useState(false);
  const [fading, setFading]         = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = DEMO_CASES[caseIdx];

  // Restarts the timed demo-step animation sequence whenever the case index
  // changes. Intentional: this seeds a chain of setTimeouts that drive the
  // animation over several seconds — not a value derivable during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(0);
    setDone(false);
    setFading(false);

    let step = 0;
    const advance = () => {
      step += 1;
      setVisible(step);
      if (step < current.steps.length) {
        timerRef.current = setTimeout(advance, STEP_DELAY_MS);
      } else {
        timerRef.current = setTimeout(() => {
          setDone(true);
          timerRef.current = setTimeout(() => {
            setFading(true);
            timerRef.current = setTimeout(() => {
              setCaseIdx((i) => (i + 1) % DEMO_CASES.length);
            }, 500);
          }, CYCLE_PAUSE_MS);
        }, STEP_DELAY_MS);
      }
    };

    timerRef.current = setTimeout(advance, 600);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [caseIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-200/60 overflow-hidden transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 bg-gray-50 border-b border-gray-100 px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-red-400" />
        <div className="h-3 w-3 rounded-full bg-amber-400" />
        <div className="h-3 w-3 rounded-full bg-emerald-400" />
        <span className="ml-2 text-xs text-gray-400 font-mono">nestfleet · live processing</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-emerald-600 font-medium">live</span>
        </span>
      </div>

      {/* Inbound email */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm">
            📧
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-gray-400 font-medium truncate">{current.from}</p>
            <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{current.subject}</p>
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">{current.preview}</p>
          </div>
        </div>
      </div>

      {/* Processing steps */}
      <div className="px-4 py-3 space-y-2.5 min-h-[164px]">
        {current.steps.map((step, i) => {
          const cols = colorMap[step.color];
          const visible = i < visibleSteps;
          return (
            <div
              key={i}
              className={`flex items-center gap-2.5 transition-all duration-400 ${
                visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
              style={{ transitionDelay: visible ? "0ms" : "0ms" }}
            >
              {/* Dot / spinner */}
              {i < visibleSteps - 1 || done ? (
                <svg className={`h-4 w-4 shrink-0 ${cols.check}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : visible ? (
                <svg className={`h-4 w-4 shrink-0 ${cols.dot.replace("bg-", "text-")} animate-spin`} fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="15" opacity="0.3" />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" opacity="0.8" />
                </svg>
              ) : (
                <div className={`h-4 w-4 shrink-0 rounded-full border-2 ${cols.dot.replace("bg-", "border-")} opacity-20`} />
              )}
              <span className="text-xs text-gray-600 font-medium flex-1 truncate">{step.label}</span>
              {visible && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${cols.badge}`}>
                  {step.result}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Outcome footer */}
      <div
        className={`border-t border-gray-100 px-4 py-3 transition-all duration-500 ${
          done ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {current.outcome}
          </span>
          <span className="text-[11px] text-gray-400 font-mono">{current.outcomeTime} total</span>
        </div>
      </div>

      {/* Step dots */}
      <div className="flex justify-center gap-1.5 pb-3">
        {DEMO_CASES.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              setFading(false);
              setCaseIdx(i);
            }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === caseIdx ? "w-4 bg-indigo-500" : "w-1.5 bg-gray-300 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
