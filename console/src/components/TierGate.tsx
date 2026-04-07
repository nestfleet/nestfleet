"use client";

/**
 * TierGate — renders an upgrade prompt when the current license tier is below
 * the required tier, otherwise renders children.
 */

import { type ProductTier, tierAtLeast } from "@/lib/useLicense";

const TIER_LABEL: Record<ProductTier, string> = {
  community: "Community",
  starter:   "Starter",
  growth:    "Growth",
  scale:     "Scale",
};

interface TierGateProps {
  currentTier: string | null;
  requiredTier: ProductTier;
  /** Short feature name shown in the upgrade prompt, e.g. "Cost & Token Analytics" */
  featureName?: string;
  children: React.ReactNode;
}

export function TierGate({ currentTier, requiredTier, featureName, children }: TierGateProps) {
  if (tierAtLeast(currentTier, requiredTier)) {
    return <>{children}</>;
  }

  const label = featureName ?? "This feature";
  const tierLabel = TIER_LABEL[requiredTier];

  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 py-16 text-center ring-1 ring-gray-200">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50">
        <svg
          className="h-6 w-6 text-indigo-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </div>

      <p className="text-sm font-semibold text-gray-800">
        {label} requires {tierLabel} or higher
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Your current plan:{" "}
        <span className="font-medium capitalize">
          {currentTier ?? "Development (full access)"}
        </span>
      </p>

      <a
        href="/settings?section=plan"
        className="mt-4 inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
      >
        View plans →
      </a>
    </div>
  );
}
