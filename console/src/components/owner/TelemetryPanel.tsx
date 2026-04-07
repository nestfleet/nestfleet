/**
 * TelemetryPanel — displays active-instance KPI, version distribution bars,
 * and a compact instance list for the owner dashboard.
 *
 * Usage:
 *   <TelemetryPanel data={telemetryData} />
 */

import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import type { TelemetryData } from "@/lib/owner-api";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

function relativeTime(isoString: string): string {
  try {
    return formatDistanceToNow(new Date(isoString), { addSuffix: true });
  } catch {
    return isoString;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActiveInstancesKpi({ count }: { count: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5 flex items-start gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-500 shrink-0">
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
            d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
          />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Active Instances (24h)
        </p>
        <p className="mt-1 text-2xl font-bold text-gray-900">
          {count.toLocaleString("en-US")}
        </p>
      </div>
    </div>
  );
}

interface VersionDistributionProps {
  distribution: { version: string; count: number }[];
}

function VersionDistribution({ distribution }: VersionDistributionProps) {
  const total = distribution.reduce((sum, b) => sum + b.count, 0) || 1;

  // Sort descending by count so the most popular version is on top.
  const sorted = [...distribution].sort((a, b) => b.count - a.count);

  const BAR_COLORS = [
    "bg-indigo-500",
    "bg-sky-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        Version Distribution
      </h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-gray-400">No version data available.</p>
      ) : (
        <ul className="space-y-3" aria-label="Version distribution">
          {sorted.map((bucket, i) => {
            const pct = Math.round((bucket.count / total) * 100);
            const colorClass = BAR_COLORS[i % BAR_COLORS.length];
            return (
              <li key={bucket.version}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-medium text-gray-700">
                    {bucket.version}
                  </span>
                  <span className="text-xs text-gray-400">
                    {bucket.count} ({pct}%)
                  </span>
                </div>
                <div
                  className="h-2 w-full rounded-full bg-gray-100 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${bucket.version}: ${pct}%`}
                >
                  <div
                    className={clsx("h-full rounded-full transition-all", colorClass)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface InstanceListProps {
  instances: { instanceId: string; lastSeenAt: string }[];
}

function InstanceList({ instances }: InstanceListProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">
        Instance Activity
      </h2>
      {instances.length === 0 ? (
        <p className="text-sm text-gray-400">No instances reported.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" aria-label="Instance activity">
            <thead>
              <tr className="border-b border-gray-100">
                <th
                  scope="col"
                  className="py-2 pr-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wide"
                >
                  Instance ID
                </th>
                <th
                  scope="col"
                  className="py-2 text-right text-xs font-medium text-gray-400 uppercase tracking-wide"
                >
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {instances.map((inst) => (
                <tr key={inst.instanceId} className="hover:bg-gray-50/60">
                  <td className="py-2 pr-4">
                    <span
                      className="font-mono text-xs text-gray-700"
                      title={inst.instanceId}
                    >
                      {truncateId(inst.instanceId)}
                    </span>
                  </td>
                  <td className="py-2 text-right text-xs text-gray-400 whitespace-nowrap">
                    {relativeTime(inst.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function TelemetryPanelSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {/* KPI skeleton */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5 h-20 animate-pulse">
        <div className="h-3 w-32 bg-gray-200 rounded mb-3" />
        <div className="h-6 w-16 bg-gray-200 rounded" />
      </div>
      {/* Bar chart skeleton */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5 animate-pulse">
        <div className="h-3 w-40 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          {[80, 50].map((w, i) => (
            <div key={i}>
              <div className="h-2.5 w-24 bg-gray-200 rounded mb-1.5" />
              <div
                className="h-2 bg-gray-200 rounded-full"
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      {/* Table skeleton */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-5 animate-pulse">
        <div className="h-3 w-32 bg-gray-200 rounded mb-4" />
        <div className="space-y-2.5">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex justify-between">
              <div className="h-2.5 w-24 bg-gray-200 rounded" />
              <div className="h-2.5 w-16 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface TelemetryPanelProps {
  data: TelemetryData;
}

export function TelemetryPanel({ data }: TelemetryPanelProps) {
  return (
    <div className="space-y-4">
      <ActiveInstancesKpi count={data.activeInstances} />
      <VersionDistribution distribution={data.versionDistribution} />
      <InstanceList instances={data.instances} />
    </div>
  );
}
