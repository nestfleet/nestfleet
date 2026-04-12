// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import { useState, useRef } from "react";

interface FAQItem {
  q: string;
  a: string;
}

interface FAQGroup {
  label: string;
  items: FAQItem[];
}

const FAQ_GROUPS: FAQGroup[] = [
  {
    label: "The Basics",
    items: [
      {
        q: "What kinds of signals can NestFleet ingest?",
        a: "NestFleet currently supports inbound email (via webhook), GitHub issues and PR events, and Telegram messages. The ingestion layer is adapter-based, so new signal types can be added without touching core logic. Each signal is normalized into a unified case representation before any AI processing begins.",
      },
      {
        q: "How does AI triage actually work?",
        a: "When a signal arrives, the triage agent reads the normalized payload and calls your configured LLM provider (OpenAI, Anthropic, or Gemini) with a structured prompt that includes your product context and severity policy. The output is a validated JSON object: severity, type, labels, confidence score, and routing recommendation. The full reasoning trace is stored with every case.",
      },
      {
        q: "How quickly can we get set up?",
        a: "For a team already running Docker and with a supported email provider (Postmark, SendGrid, or any SMTP relay), the typical time from git clone to first processed case is under 30 minutes. There's a seed script for products and known issues, and a guided onboarding flow in the console.",
      },
    ],
  },
  {
    label: "Control & Oversight",
    items: [
      {
        q: "Can I review or override AI decisions at any step?",
        a: "Yes — and this is a core design principle. Every AI decision is visible in the lineage timeline. Operators can escalate a case to a lead reviewer, reject a change request, or approve an action at any point. The AI never has final say on anything that touches production — it proposes, humans confirm.",
      },
      {
        q: "What happens when AI confidence is low?",
        a: "You configure confidence thresholds per action type. Below your threshold, NestFleet automatically routes to the 'awaiting-lead' queue rather than acting autonomously. This means high-volume easy cases get instant resolution while ambiguous or complex cases always surface for human review.",
      },
      {
        q: "Can I see exactly why a case was routed a specific way?",
        a: "Every routing decision is stored with full metadata: the agent's reasoning text, the known issue match (including similarity score and matched chunk), and the specific policy conditions that triggered the path. The lineage timeline in the console shows this in a human-readable format.",
      },
    ],
  },
  {
    label: "Privacy & Data",
    items: [
      {
        q: "Is my customer data used to train AI models?",
        a: "No. NestFleet uses your configured LLM provider (OpenAI, Anthropic, or Gemini) via API. We have no model training pipeline and we do not share your data with any third party. If you use the Anthropic API with zero data retention enabled, customer message content is never stored outside your infrastructure.",
      },
      {
        q: "What data is stored and where?",
        a: "NestFleet stores signals (email content), normalized case data, triage results, change requests, and audit events in your PostgreSQL database. The database runs in your infrastructure — NestFleet is fully self-hosted. The output_snapshot field on agent runs (which may contain message content) is access-gated behind an audit:read scope.",
      },
    ],
  },
  {
    label: "Integrations",
    items: [
      {
        q: "Does NestFleet integrate with GitHub?",
        a: "Yes. The pr_draft_prep agent can open GitHub issues and pull requests on your behalf using a configured GITHUB_TOKEN. It uses your product's architecture docs and changelog from the knowledge base to write meaningful PR descriptions. GitHub webhooks can also be used as a signal source.",
      },
      {
        q: "Can NestFleet work with our existing Zendesk or Intercom setup?",
        a: "Not natively yet — NestFleet processes signals from email and webhooks directly. A Zendesk or Intercom adapter would forward tickets as signals via webhook. This is on the roadmap. If you're evaluating NestFleet for a Zendesk migration, reach out — we can discuss your timeline.",
      },
    ],
  },
  {
    label: "Open Source & Self-hosting",
    items: [
      {
        q: "Is it really free to self-host?",
        a: "Yes. NestFleet is licensed under AGPL-3.0. You can run it on your own infrastructure indefinitely for free — no license key, no usage cap, no expiry. The Community tier supports one active product. If you need multiple products or managed hosting, the paid tiers apply.",
      },
      {
        q: "Do I need to create an account or register anywhere to self-host?",
        a: "No. Self-hosted deployments are fully standalone — no account needed, no registration, no cloud service dependency. You bring your own LLM API key (Anthropic, OpenAI, Gemini, or local Ollama) and your own PostgreSQL. That's it.",
      },
      {
        q: "What's the difference between self-hosting and nestfleet.dev managed SaaS?",
        a: "Self-hosting means you run the stack on your own servers — full control, zero data leaving your infra, no per-seat fee. Managed SaaS at nestfleet.dev handles infrastructure, upgrades, and backups for you. Both use the same open-source codebase. Choose self-host for compliance and cost control; choose SaaS for zero-ops.",
      },
      {
        q: "Can I contribute to NestFleet?",
        a: "Yes — the full source code is on GitHub at github.com/nestfleet/nestfleet. Open issues, PRs, and discussions are welcome. See CONTRIBUTING.md for setup instructions and the PR guidelines.",
      },
    ],
  },
];

function AccordionItem({ item, open, onToggle }: {
  item: FAQItem;
  open: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group focus:outline-none"
        aria-expanded={open}
      >
        <span className={`text-sm font-semibold leading-snug transition-colors ${open ? "text-indigo-700" : "text-gray-900 group-hover:text-indigo-700"}`}>
          {item.q}
        </span>
        <span
          className={`mt-0.5 shrink-0 flex h-5 w-5 items-center justify-center rounded-full transition-all duration-200 ${
            open ? "bg-indigo-100 text-indigo-600 rotate-0" : "bg-gray-100 text-gray-500 group-hover:bg-indigo-50 group-hover:text-indigo-500"
          }`}
        >
          {open ? (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          )}
        </span>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? `${contentRef.current?.scrollHeight ?? 500}px` : "0px", opacity: open ? 1 : 0 }}
      >
        <p className="pb-5 pr-8 text-sm text-gray-500 leading-relaxed">{item.a}</p>
      </div>
    </div>
  );
}

export function LandingFAQ() {
  const [openId, setOpenId] = useState<string | null>("0-0");

  return (
    <section id="faq" className="py-24 px-5 sm:px-8 bg-white">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-16">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Common questions
          </h2>
          <p className="mt-4 text-gray-500 text-lg">
            Can't find what you're looking for?{" "}
            <a href="mailto:hello@nestfleet.dev" className="text-indigo-600 hover:underline">
              Reach out directly.
            </a>
          </p>
        </div>

        {/* Groups */}
        <div className="grid md:grid-cols-2 gap-x-16 gap-y-2">
          {FAQ_GROUPS.map((group, gi) => (
            <div key={gi}>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                {group.label}
              </p>
              <div className="rounded-xl bg-gray-50 ring-1 ring-gray-100 px-5 mb-6">
                {group.items.map((item, ii) => {
                  const id = `${gi}-${ii}`;
                  return (
                    <AccordionItem
                      key={id}
                      item={item}
                      open={openId === id}
                      onToggle={() => setOpenId(openId === id ? null : id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
