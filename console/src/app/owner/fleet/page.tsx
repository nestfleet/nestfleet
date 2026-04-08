"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import clsx from "clsx";
import {
  getOwnerFleetApi,
  postOwnerFleetResetApi,
  postOwnerFleetRetryApi,
  postOwnerFleetDeprovisionApi,
  type FleetResponse,
  type Provisioning,
} from "@/lib/owner-api";
import { FleetStatusBadge } from "@/components/owner/FleetStatusBadge";

const PAGE_LIMIT = 20;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HealthDot({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300"
        title="Unknown"
        aria-label="Health unknown"
      />
    );
  }
  const healthy = status === "healthy" || status === "ok";
  return (
    <span
      className={clsx(
        "inline-block h-2.5 w-2.5 rounded-full",
        healthy ? "bg-emerald-400" : "bg-red-400"
      )}
      title={status}
      aria-label={`Health: ${status}`}
    />
  );
}

interface ConfirmDeprovisionDialogProps {
  slug: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}

function ConfirmDeprovisionDialog({
  slug,
  onConfirm,
  onCancel,
  pending,
}: ConfirmDeprovisionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deprovision-dialog-title"
    >
      <div className="bg-white rounded-xl shadow-2xl ring-1 ring-black/10 p-6 max-w-sm w-full mx-4">
        <h2
          id="deprovision-dialog-title"
          className="text-base font-semibold text-gray-900"
        >
          Deprovision{" "}
          <span className="font-mono text-sm text-gray-600">{slug}</span>?
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Are you sure? This will start a 30-day grace period before the server
          is permanently deprovisioned.
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Deprovisioning..." : "Deprovision"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FleetRowActionsProps {
  row: Provisioning;
  onActionDone: () => void;
}

function FleetRowActions({ row, onActionDone }: FleetRowActionsProps) {
  const [resetting, setResetting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deprovisioning, setDeprovisioning] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await postOwnerFleetRetryApi(row.org_slug);
      onActionDone();
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await postOwnerFleetResetApi(row.org_slug);
      onActionDone();
    } catch {
      // ignore — could add toast here
    } finally {
      setResetting(false);
    }
  }

  async function handleDeprovisionConfirm() {
    setDeprovisioning(true);
    try {
      await postOwnerFleetDeprovisionApi(row.org_slug, { immediate: true });
      onActionDone();
      setShowConfirm(false);
    } catch {
      // ignore
    } finally {
      setDeprovisioning(false);
    }
  }

  return (
    <>
      {showConfirm && (
        <ConfirmDeprovisionDialog
          slug={row.org_slug}
          onConfirm={handleDeprovisionConfirm}
          onCancel={() => setShowConfirm(false)}
          pending={deprovisioning}
        />
      )}
      <div className="flex items-center gap-2">
        {row.status === "failed" && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="rounded px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            aria-label={`Retry provisioning ${row.org_slug}`}
          >
            {retrying ? "Retrying..." : "Retry"}
          </button>
        )}
        <button
          onClick={handleReset}
          disabled={resetting}
          className="rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          aria-label={`Reset ${row.org_slug}`}
        >
          {resetting ? "Resetting..." : "Reset"}
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={row.status === "deprovisioned" || row.status === "deprovisioning"}
          className="rounded px-2 py-1 text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={`Deprovision ${row.org_slug}`}
        >
          Deprovision
        </button>
      </div>
    </>
  );
}

export default function FleetPage() {
  const [offset, setOffset] = useState(0);

  const fetcher = () => getOwnerFleetApi({ limit: PAGE_LIMIT, offset });

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<FleetResponse>(
    ["owner-fleet", offset],
    fetcher,
    { keepPreviousData: true }
  );

  const rows: Provisioning[] = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_LIMIT);
  const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

  function onActionDone() {
    void mutate();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Fleet</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {total} total provisioning
            {total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-red-950/60 border border-red-700/40 px-4 py-3"
        >
          <p className="text-sm text-red-300">
            {(error as Error).message ?? "Failed to load fleet data."}
          </p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  Slug
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  Plan
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  IP
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  Provisioned
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  Health
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading && rows.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} aria-hidden="true">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gray-400 text-sm"
                  >
                    No fleet entries found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-900 whitespace-nowrap">
                      <Link
                        href={`/owner/fleet/${row.org_slug}`}
                        className="text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {row.org_slug}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <FleetStatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap capitalize">
                      {row.plan}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {row.hetzner_server_ip ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(row.provisioned_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <HealthDot status={row.last_health_status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <FleetRowActions row={row} onActionDone={onActionDone} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_LIMIT && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalPages} &mdash; {total} total
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
                disabled={offset === 0}
                className="rounded px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous page"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_LIMIT)}
                disabled={offset + PAGE_LIMIT >= total}
                className="rounded px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
