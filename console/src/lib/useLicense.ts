"use client";

/**
 * useLicense — fetches the installation's current license tier from the API.
 *
 * Tier order: community < starter < growth < scale
 * Dev mode (tier = null) is treated as "scale" — full access.
 */

import useSWR from "swr";
import { getLicenseStatusApi } from "./api";
import type { LicenseStatus } from "./types";

export type ProductTier = "community" | "starter" | "growth" | "scale";

const TIER_ORDER: Record<string, number> = {
  community: 0,
  starter:   1,
  growth:    2,
  scale:     3,
};

/**
 * Returns true if `current` meets or exceeds `required`.
 * null (dev mode) is treated as scale (full access).
 */
export function tierAtLeast(current: string | null, required: ProductTier): boolean {
  const currentOrder = current !== null ? (TIER_ORDER[current] ?? 0) : 3;
  const requiredOrder = TIER_ORDER[required] ?? 0;
  return currentOrder >= requiredOrder;
}

export interface UseLicenseResult {
  license: LicenseStatus | null;
  tier: string | null;
  features: string[];
  isLoading: boolean;
  /** Days remaining on a trial license; null if not on trial or no expiry info */
  trialDaysRemaining: number | null;
  /** W6-06: OU consumption for the current calendar month; null if unavailable */
  ouUsage: { usage: number; limit: number; percent: number } | null;
  /** Convenience: true if current tier meets or exceeds `required` */
  tierAtLeast: (required: ProductTier) => boolean;
}

export function useLicense(): UseLicenseResult {
  const { data, isLoading } = useSWR(
    "license-status",
    () => getLicenseStatusApi(),
    { refreshInterval: 5 * 60 * 1_000 }, // re-check every 5 min
  );

  const license = data?.data ?? null;
  const tier = license?.tier ?? null;
  const features = license?.features ?? [];

  const trialDaysRemaining =
    tier === "trial" && license?.expiresAt
      ? Math.max(0, Math.ceil(
          (new Date(license.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ))
      : null;

  return {
    license,
    tier,
    features,
    isLoading,
    trialDaysRemaining,
    ouUsage: license?.ouUsage ?? null,
    tierAtLeast: (required: ProductTier) => tierAtLeast(tier, required),
  };
}
