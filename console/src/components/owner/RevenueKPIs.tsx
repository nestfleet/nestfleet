// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import clsx from "clsx";
import type { RevenueData } from "@/lib/owner-api";

interface RevenueKPIsProps {
  data: RevenueData;
}

function formatDollars(cents: number): string {
  const dollars = Math.floor(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  valueClassName?: string;
}

function KpiCard({ label, value, icon, valueClassName }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5 flex items-start gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          {label}
        </p>
        <p
          className={clsx(
            "mt-1 text-2xl font-bold text-gray-900 truncate",
            valueClassName
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function RevenueKPIs({ data }: RevenueKPIsProps) {
  const { mrrCents, arrCents, paidCount, trialCount, churn30d } = data;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      aria-label="Revenue KPI cards"
    >
      <KpiCard
        label="MRR"
        value={formatDollars(mrrCents)}
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      />

      <KpiCard
        label="ARR"
        value={formatDollars(arrCents)}
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
            />
          </svg>
        }
      />

      <KpiCard
        label="Paid Accounts"
        value={paidCount.toLocaleString("en-US")}
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
            />
          </svg>
        }
      />

      <KpiCard
        label="Trials"
        value={trialCount.toLocaleString("en-US")}
        icon={
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        }
      />

      {/* Churn 30d — spans full row on small screens as a standalone alert card */}
      <div
        className={clsx(
          "bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5 flex items-start gap-4",
          "sm:col-span-2 xl:col-span-4"
        )}
      >
        <div
          className={clsx(
            "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
            churn30d > 0 ? "bg-amber-50 text-amber-500" : "bg-slate-50 text-slate-400"
          )}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Churn (30d)
          </p>
          <p
            className={clsx(
              "mt-1 text-2xl font-bold",
              churn30d > 0 ? "text-amber-600" : "text-gray-900"
            )}
          >
            {churn30d.toLocaleString("en-US")}
            {churn30d > 0 && (
              <span className="ml-2 text-sm font-normal text-amber-500">
                accounts churned
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
