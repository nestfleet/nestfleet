"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import {
  type ProductTier,
  type FeatureEntry,
  getNewFeaturesAtTier,
  getLockedTeaserFeatures,
  getTierNote,
} from "@/lib/feature-catalog";
import { WaitlistButton } from "@/components/WaitlistButton";
import { WAITLIST_MODE } from "@/lib/flags";

// ── Plan metadata (pricing / limits / CTA — not in FEATURE_CATALOG) ───────────

interface PlanMeta {
  key:      ProductTier;
  name:     string;
  price:    string;
  period:   string;
  desc:     string;
  limits:   string[];   // product count, OU quota, support — not feature catalog items
  cta:      string;
  ctaHref:  string;
  popular:  boolean;
  badge:    string | null;
  prev:     string | null;  // "Includes everything in X +" line
}

const PLANS: PlanMeta[] = [
  {
    key:     "community",
    name:    "Community",
    price:   "$0",
    period:  "forever · free · AGPL-3.0 open source",
    desc:    "For developers, OSS projects, and personal experiments. No time limit.",
    limits:  ["Unlimited products", "200 Outcome Units / month", "Email channel", "Community support"],
    cta:     "Self-host free on GitHub",
    ctaHref: "https://github.com/nestfleet/nestfleet",
    popular: false,
    badge:   null,
    prev:    null,
  },
  {
    key:     "starter",
    name:    "Starter",
    price:   "$99",
    period:  "per month · billed monthly or annually",
    desc:    "Up to 3 products for solopreneurs and small teams. Includes a 30-day free trial — no card required.",
    limits:  ["Up to 3 active products", "1,000 Outcome Units / month", "Email support"],
    cta:     "Start 30-day trial",
    ctaHref: "/signup?plan=starter",
    popular: false,
    badge:   null,
    prev:    "Community",
  },
  {
    key:     "growth",
    name:    "Growth",
    price:   "$499",
    period:  "per month · billed monthly or annually",
    desc:    "Up to 10 products with full analytics, GDPR tooling, and autonomous AI pipelines. 14-day trial available.",
    limits:  ["Up to 10 active products", "10,000 Outcome Units / month", "Priority email support"],
    cta:     "Try Growth — 14 days",
    ctaHref: "/signup?plan=growth",
    popular: true,
    badge:   null,
    prev:    "Starter",
  },
  {
    key:     "scale",
    name:    "Scale",
    price:   "Custom",
    period:  "starting at $2,500 / month",
    desc:    "Unlimited products, full RBAC studio, SSO, custom compliance bundles, and dedicated support.",
    limits:  ["Unlimited active products", "100,000+ Outcome Units / month", "Dedicated onboarding + support"],
    cta:     "Talk to us",
    ctaHref: "mailto:hello@nestfleet.dev",
    popular: false,
    badge:   null,
    prev:    "Growth",
  },
];

// ── Row components ─────────────────────────────────────────────────────────────

function IncludedRow({ feature, tier }: { feature: FeatureEntry; tier: ProductTier }) {
  const note = getTierNote(feature, tier);
  return (
    <li className="flex items-start gap-2.5">
      <svg className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      <span>
        <span className="text-sm text-gray-700">{feature.label}</span>
        {note && (
          <span className="block text-[11px] text-gray-400 leading-snug mt-0.5">{note}</span>
        )}
      </span>
    </li>
  );
}

function LimitRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg className="h-4 w-4 mt-0.5 shrink-0 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h4.5" />
      </svg>
      <span className="text-sm text-gray-700">{text}</span>
    </li>
  );
}

function LockedRow({ feature }: { feature: FeatureEntry }) {
  return (
    <li className="flex items-start gap-2.5 text-gray-300">
      <svg className="h-4 w-4 mt-0.5 shrink-0 text-gray-200" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <span className="text-sm">{feature.label}</span>
    </li>
  );
}

// ── Plan card ──────────────────────────────────────────────────────────────────

function PlanCard({ plan, visible, delay }: { plan: PlanMeta; visible: boolean; delay: string }) {
  const newFeatures  = getNewFeaturesAtTier(plan.key);
  const lockedFeatures = getLockedTeaserFeatures(plan.key, 3);

  return (
    <div
      className={`relative rounded-2xl border p-7 flex flex-col transition-all duration-700 ${delay} hover:-translate-y-1 hover:shadow-xl ${
        plan.popular
          ? "border-indigo-300 shadow-lg shadow-indigo-100 bg-white ring-2 ring-indigo-500/20"
          : "border-gray-200 bg-white shadow-sm hover:shadow-md"
      } ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
    >
      {(plan.popular || plan.badge) && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex gap-1.5">
          {plan.popular && (
            <span className="rounded-full bg-indigo-600 px-4 py-1 text-xs font-bold text-white shadow whitespace-nowrap">
              Most popular
            </span>
          )}
          {plan.badge && (
            <span className="rounded-full bg-emerald-600 px-4 py-1 text-xs font-bold text-white shadow whitespace-nowrap">
              {plan.badge}
            </span>
          )}
        </div>
      )}

      {/* Price block */}
      <div className="mb-5">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>
        <p className="text-2xl font-extrabold text-gray-900">{plan.price}</p>
        <p className="text-xs text-gray-400 mt-0.5">{plan.period}</p>
      </div>

      <p className="text-sm text-gray-500 leading-relaxed mb-5">{plan.desc}</p>

      {/* Feature list */}
      <ul className="space-y-2.5 mb-8 flex-1">
        {/* Plan limits (products, OUs, support) */}
        {plan.limits.map((l) => (
          <LimitRow key={l} text={l} />
        ))}

        {/* Inherited tier line */}
        {plan.prev && (
          <li className="flex items-center gap-2 pt-1 pb-0.5">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-[11px] text-gray-400 whitespace-nowrap">
              Everything in {plan.prev}, plus:
            </span>
            <div className="h-px flex-1 bg-gray-100" />
          </li>
        )}

        {/* New features at this tier — labels verbatim from FEATURE_CATALOG */}
        {newFeatures.map((f) => (
          <IncludedRow key={f.id} feature={f} tier={plan.key} />
        ))}

        {/* Locked teaser — first 3 features from next tier */}
        {lockedFeatures.length > 0 && (
          <>
            <li className="pt-1" aria-hidden="true">
              <div className="h-px bg-gray-100" />
            </li>
            {lockedFeatures.map((f) => (
              <LockedRow key={f.id} feature={f} />
            ))}
          </>
        )}
      </ul>

      {/* Waitlist mode: replace paid plan CTAs with pre-registration button */}
      {WAITLIST_MODE && (plan.key === "starter" || plan.key === "growth") ? (
        <WaitlistButton
          planHint={plan.key}
          label="Join the waitlist →"
          className={`block w-full rounded-xl py-3 text-center text-sm font-bold transition-all active:scale-95 ${
            plan.popular
              ? "!bg-indigo-600 !text-white hover:!bg-indigo-700 shadow-md shadow-indigo-200"
              : "!bg-transparent border border-indigo-300 !text-indigo-700 hover:!bg-indigo-50"
          }`}
        />
      ) : plan.ctaHref.startsWith("http") || plan.ctaHref.startsWith("mailto") ? (
        <a
          href={plan.ctaHref}
          target={plan.ctaHref.startsWith("http") ? "_blank" : undefined}
          rel={plan.ctaHref.startsWith("http") ? "noopener noreferrer" : undefined}
          className={`block w-full rounded-xl py-3 text-center text-sm font-bold transition-all active:scale-95 ${
            plan.popular
              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200"
              : "border border-gray-200 text-gray-700 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50"
          }`}
        >
          {plan.cta}
        </a>
      ) : (
        <Link
          href={plan.ctaHref}
          className={`block w-full rounded-xl py-3 text-center text-sm font-bold transition-all active:scale-95 ${
            plan.popular
              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200"
              : "border border-gray-200 text-gray-700 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50"
          }`}
        >
          {plan.cta}
        </Link>
      )}
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

const CARD_DELAYS = ["delay-0", "delay-75", "delay-150", "delay-200"];

export function PricingSection() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section ref={ref} id="pricing" className="py-24 px-5 sm:px-8 bg-white">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className={`text-center mb-14 transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-indigo-200">
            PRICING
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            {process.env.NEXT_PUBLIC_BILLING_ENABLED === "true"
              ? "Priced by products. Not seats."
              : "Free to self-host. Forever."}
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-gray-500 text-lg leading-relaxed">
            {process.env.NEXT_PUBLIC_BILLING_ENABLED === "true"
              ? "Pay for the products you operate and the outcomes you automate. No per-seat sprawl. No opaque AI action counters."
              : "One product, full feature set, AGPL-3.0 open source. Run it on your own infrastructure at no cost."}
          </p>
        </div>

        {/* Baseline note */}
        <div className={`mb-8 flex items-center justify-center transition-all duration-700 delay-75 ${visible ? "opacity-100" : "opacity-0"}`}>
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-200 px-4 py-2 text-xs text-gray-500">
            <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Every tier includes the full signal → triage → change request → GitHub PR cycle
          </div>
        </div>

        {/* Tier cards */}
        {process.env.NEXT_PUBLIC_BILLING_ENABLED === "true" ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((plan, i) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                visible={visible}
                delay={CARD_DELAYS[i]}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <div className="w-full max-w-sm">
              <PlanCard
                plan={PLANS[0]}
                visible={visible}
                delay={CARD_DELAYS[0]}
              />
            </div>
            <p className={`text-sm text-gray-500 transition-all duration-700 delay-150 ${visible ? "opacity-100" : "opacity-0"}`}>
              Starter, Growth, and Scale plans available on{" "}
              <a href="https://nestfleet.dev" className="text-indigo-600 hover:underline font-medium">
                nestfleet.dev
              </a>{" "}
              — managed hosting with zero ops.
            </p>
          </div>
        )}

        {/* Footer trust notes */}
        <div className={`mt-10 grid sm:grid-cols-3 gap-5 transition-all duration-700 delay-200 ${visible ? "opacity-100" : "opacity-0"}`}>
          {[
            {
              icon:  "🏠",
              title: "Always client-installed",
              body:  "Every tier runs on your own infrastructure. NestFleet never sees your operational data.",
            },
            {
              icon:  "🔍",
              title: "Open source (AGPL-3.0)",
              body:  "Full source code on GitHub. Inspect, fork, self-host. Managed SaaS available for teams that prefer zero ops.",
            },
            {
              icon:  "🤖",
              title: "BYO LLM provider",
              body:  "OpenAI, Anthropic, Gemini, or self-hosted Ollama. You control the model and the cost.",
            },
          ].map((n) => (
            <div key={n.title} className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="text-xl shrink-0">{n.icon}</div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-0.5">{n.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{n.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
