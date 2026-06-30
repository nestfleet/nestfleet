// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

import useSWR from "swr";
import { RevenueKPIs } from "@/components/owner/RevenueKPIs";
import { SubscriptionTimeline } from "@/components/owner/SubscriptionTimeline";
import {
  TelemetryPanel,
  TelemetryPanelSkeleton,
} from "@/components/owner/TelemetryPanel";
import {
  getOwnerRevenueApi,
  getOwnerCohortsApi,
  getOwnerTelemetryApi,
  type RevenueResponse,
  type CohortsResponse,
  type TelemetryResponse,
} from "@/lib/owner-api";

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          className="bg-white rounded-xl shadow-xs ring-1 ring-black/5 p-5 h-24 animate-pulse"
          aria-hidden="true"
        >
          <div className="h-3 w-20 bg-gray-200 rounded-sm mb-3" />
          <div className="h-6 w-28 bg-gray-200 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="bg-white rounded-xl shadow-xs ring-1 ring-black/5 p-5 h-64 animate-pulse"
      aria-hidden="true"
    >
      <div className="h-3 w-32 bg-gray-200 rounded-sm mb-4" />
      <div className="flex items-end gap-1 h-40">
        {[60, 80, 45, 90, 55, 70, 40, 85, 65, 75].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-200 rounded-xs"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function OwnerDashboardPage() {
  const fetchedAt = new Date();

  const {
    data: revenueData,
    error: revenueError,
    isLoading: revenueLoading,
  } = useSWR<RevenueResponse>("owner-revenue", getOwnerRevenueApi, {
    refreshInterval: 60_000,
  });

  const {
    error: cohortsError,
    isLoading: cohortsLoading,
  } = useSWR<CohortsResponse>("owner-cohorts", getOwnerCohortsApi, {
    refreshInterval: 60_000,
  });

  const {
    data: telemetryData,
    error: telemetryError,
    isLoading: telemetryLoading,
  } = useSWR<TelemetryResponse>("owner-telemetry", getOwnerTelemetryApi, {
    refreshInterval: 60_000,
  });

  const isLoading = revenueLoading || cohortsLoading;
  const error = revenueError ?? cohortsError;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Revenue Dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Last updated:{" "}
          {isLoading ? "loading..." : formatRelativeTime(fetchedAt)}
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-red-950/60 border border-red-700/40 px-4 py-3"
        >
          <svg
            className="h-5 w-5 text-red-400 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <p className="text-sm text-red-300">
            {(error as Error).message ?? "Failed to load revenue data."}
          </p>
        </div>
      )}

      {/* KPI cards */}
      {isLoading ? (
        <KpiSkeleton />
      ) : revenueData?.data ? (
        <RevenueKPIs data={revenueData.data} />
      ) : null}

      {/* Subscription timeline chart */}
      <section aria-label="Subscription timeline">
        <div className="bg-white rounded-xl shadow-xs ring-1 ring-black/5 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Weekly Subscriptions
          </h2>
          {isLoading ? (
            <ChartSkeleton />
          ) : revenueData?.data?.weeklySeries ? (
            <SubscriptionTimeline series={revenueData.data.weeklySeries} />
          ) : null}
        </div>
      </section>

      {/* Telemetry section */}
      <section aria-label="Instance telemetry">
        <h2 className="text-lg font-semibold text-slate-100 mb-3">
          Instance Telemetry
        </h2>

        {/* Telemetry error banner */}
        {telemetryError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg bg-red-950/60 border border-red-700/40 px-4 py-3 mb-4"
          >
            <svg
              className="h-5 w-5 text-red-400 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm text-red-300">
              {(telemetryError as Error).message ?? "Failed to load telemetry data."}
            </p>
          </div>
        )}

        {telemetryLoading ? (
          <TelemetryPanelSkeleton />
        ) : telemetryData?.data ? (
          <TelemetryPanel data={telemetryData.data} />
        ) : null}
      </section>
    </div>
  );
}
