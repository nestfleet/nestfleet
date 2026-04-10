"use client";

/**
 * BRIDGE-03: OU usage nudge banner.
 *
 * Renders an amber warning banner when the current-month Outcome Unit usage
 * reaches ≥ 80 % of the configured limit.  Hidden when limit = 0 (unlimited)
 * or when usage is below the threshold.
 *
 * Only shown to admin users (the /license/status endpoint requires admin role).
 * Dismissible within the session (state resets on page reload).
 */

import { useState } from "react";
import useSWR from "swr";
import { getLicenseStatusApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { WaitlistButton } from "@/components/WaitlistButton";
import { WAITLIST_MODE } from "@/lib/flags";

export function OuUsageBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const isAdmin = user?.roles?.includes("admin") ?? false;

  const { data } = useSWR(
    isAdmin ? "license-status-ou-banner" : null,
    () => getLicenseStatusApi(),
    {
      // Refresh every 5 minutes — no need for real-time accuracy here
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
    }
  );

  if (dismissed) return null;

  const ou = data?.data?.ouUsage;
  const tier = data?.data?.tier;

  // Only show when limit is set (> 0) and usage is at warning threshold
  if (!ou || ou.limit === 0 || ou.percent < 80) return null;

  const isBlocked = ou.usage >= ou.limit;
  const pct = Math.round(ou.percent);

  const upgradeHref =
    !tier || tier === "community"
      ? "https://nestfleet.dev"
      : "/settings?section=plan";
  const upgradeTarget = !tier || tier === "community" ? "_blank" : "_self";
  const upgradeRel = upgradeTarget === "_blank" ? "noopener noreferrer" : undefined;

  return (
    <div
      role="alert"
      className={
        isBlocked
          ? "flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5"
          : "flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5"
      }
    >
      {/* Icon */}
      <svg
        className={`h-4 w-4 shrink-0 ${isBlocked ? "text-red-500" : "text-amber-500"}`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>

      {/* Message */}
      <p className={`flex-1 text-xs font-medium ${isBlocked ? "text-red-800" : "text-amber-800"}`}>
        {isBlocked
          ? `Monthly Outcome Unit limit reached (${ou.usage} / ${ou.limit}). New case intake is paused.`
          : `You've used ${pct}% of your monthly Outcome Unit limit (${ou.usage} / ${ou.limit}).`}
        {" "}
        {WAITLIST_MODE ? (
          <WaitlistButton
            planHint="growth"
            label="Join waitlist for more capacity →"
            variant="link"
            className={isBlocked ? "text-red-700" : "text-amber-700"}
          />
        ) : (
          <a
            href={upgradeHref}
            target={upgradeTarget}
            rel={upgradeRel}
            className={`underline underline-offset-2 hover:opacity-75 transition-opacity ${isBlocked ? "text-red-700" : "text-amber-700"}`}
          >
            Upgrade for more capacity →
          </a>
        )}
      </p>

      {/* Dismiss */}
      {!isBlocked && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss usage warning"
          className="ml-auto shrink-0 rounded p-0.5 text-amber-500 hover:bg-amber-100 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
