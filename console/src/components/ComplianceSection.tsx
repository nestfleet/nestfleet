// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useRef, useEffect, useState } from "react";

const BADGES = [
  { label: "GDPR",            icon: "🇪🇺", sub: "Article 22 compliant" },
  { label: "EU AI Act",       icon: "⚖️", sub: "Transparency & human oversight" },
  { label: "Data Sovereignty",icon: "🏠", sub: "Your infra, your data" },
  { label: "NIS-2 Ready",     icon: "🛡️", sub: "Incident logging foundation" },
  { label: "CRA Ready",       icon: "📦", sub: "SBOM & secure updates" },
  { label: "BSL Source",      icon: "🔍", sub: "Fully auditable codebase" },
];

const PILLARS = [
  {
    icon: "🏠",
    title: "Data never leaves your infrastructure",
    body: "NestFleet is client-installed. All signals, cases, change requests, and audit logs stay in your PostgreSQL database. The cloud connection sends zero customer content — only aggregate usage counts and error type codes.",
    tags: ["GDPR Art. 5", "Data minimisation", "No cross-customer sharing"],
  },
  {
    icon: "🔍",
    title: "Every AI decision is traceable",
    body: "No opaque black-box outputs. Every agent action is a typed, schema-validated proposal backed by evidence references. The audit trail records the model, prompt inputs, output validation result, and human decision point — suitable for DPIA and regulatory investigation.",
    tags: ["GDPR Art. 22", "Explainability", "Immutable audit log"],
  },
  {
    icon: "🤝",
    title: "Lightweight legal footprint",
    body: "NestFleet operates as a software vendor, not a data processor. Your DPA scope is limited to cloud-connection metadata only. You control your own LLM vendor relationship and compliance posture. Compliance template bundles (DPIA, privacy notices, AI disclosure) are delivered via cloud update.",
    tags: ["Minimal DPA", "Controller-friendly", "Templates included"],
  },
  {
    icon: "🚫",
    title: "Hard boundaries on consequential decisions",
    body: "NestFleet is policy-prohibited from automated decisions with legal or significant personal effect. No HR, credit, insurance, law-enforcement, or welfare workflows. All high-impact actions require human approval. The forbidden-action list is code-enforced, not just documented.",
    tags: ["GDPR Art. 22(1)", "EU AI Act high-risk", "Hard-coded guardrails"],
  },
];

export function ComplianceSection() {
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
    <section ref={ref} id="compliance" className="py-24 px-5 sm:px-8 bg-gray-50">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className={`text-center mb-14 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
            TRUST & COMPLIANCE
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Built for regulated teams.
          </h2>
          <p className="mt-4 max-w-2xl mx-auto text-gray-500 text-lg leading-relaxed">
            GDPR, EU AI Act, data sovereignty, and full auditability — not as add-ons, but as
            architectural decisions made at the start.
          </p>
        </div>

        {/* Compliance badge strip */}
        <div className={`flex flex-wrap justify-center gap-3 mb-14 transition-all duration-700 delay-100 ${visible ? "opacity-100" : "opacity-0"}`}>
          {BADGES.map((b, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs hover:shadow-md transition-all hover:-translate-y-0.5"
            >
              <span className="text-xl">{b.icon}</span>
              <div>
                <p className="text-sm font-bold text-gray-900">{b.label}</p>
                <p className="text-[10px] text-gray-400">{b.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Pillars grid */}
        <div className={`grid sm:grid-cols-2 gap-5 transition-all duration-700 delay-200 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          {PILLARS.map((p, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-xl">
                {p.icon}
              </div>
              <h3 className="mb-2 text-base font-bold text-gray-900">{p.title}</h3>
              <p className="mb-4 text-sm text-gray-500 leading-relaxed">{p.body}</p>
              <div className="flex flex-wrap gap-2">
                {p.tags.map((t, j) => (
                  <span key={j} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* BSL footnote */}
        <div className={`mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4 transition-all duration-700 delay-300 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="text-2xl shrink-0 mt-0.5">📄</div>
          <div>
            <h4 className="text-sm font-bold text-amber-900 mb-1">Business Source License — inspect before you deploy</h4>
            <p className="text-sm text-amber-800 leading-relaxed">
              NestFleet&apos;s full source code is readable for security audit and review.
              Production use requires an active subscription.
              The license converts to full open source after 3–4 years.
              No hidden behaviour. No surprise changes. You can see exactly what runs in your infrastructure.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
