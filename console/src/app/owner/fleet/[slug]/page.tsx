"use client";

import { useState } from "react";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import clsx from "clsx";
import {
  getOwnerFleetItemApi,
  postOwnerFleetResetApi,
  postOwnerFleetDeprovisionApi,
  type FleetItemResponse,
} from "@/lib/owner-api";
import { FleetStatusBadge } from "@/components/owner/FleetStatusBadge";
import { DetailRow } from "@/components/DetailRow";

interface FleetDetailPageProps {
  params: Promise<{ slug: string }>;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function FleetDetailPage({ params }: FleetDetailPageProps) {
  const { slug } = use(params);

  const { data, error, isLoading, mutate } = useSWR<FleetItemResponse>(
    ["owner-fleet-item", slug],
    () => getOwnerFleetItemApi(slug)
  );

  const [resetting, setResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deprovisioning, setDeprovisioning] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function handleReset() {
    setResetting(true);
    setActionMessage(null);
    try {
      const res = await postOwnerFleetResetApi(slug);
      setActionMessage(res.message ?? "Reset initiated.");
      void mutate();
    } catch (err) {
      setActionMessage((err as Error).message ?? "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  async function handleDeprovisionConfirm() {
    setDeprovisioning(true);
    setActionMessage(null);
    try {
      const res = await postOwnerFleetDeprovisionApi(slug, { graceDays: 30 });
      setActionMessage(res.message ?? "Deprovision started.");
      setShowConfirm(false);
      void mutate();
    } catch (err) {
      setActionMessage((err as Error).message ?? "Deprovision failed.");
    } finally {
      setDeprovisioning(false);
    }
  }

  const p = data?.data;

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Back link */}
      <Link
        href="/owner/fleet"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
        Back to Fleet
      </Link>

      {/* Page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-100 font-mono">{slug}</h1>
        {p && <FleetStatusBadge status={p.status} />}
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-red-950/60 border border-red-700/40 px-4 py-3"
        >
          <p className="text-sm text-red-300">
            {(error as Error).message ?? "Failed to load provisioning details."}
          </p>
        </div>
      )}

      {/* Action message */}
      {actionMessage && (
        <div
          role="status"
          className="rounded-lg bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-slate-300"
        >
          {actionMessage}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && !p && (
        <div
          className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-6 animate-pulse"
          aria-hidden="true"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <div className="h-2.5 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-32 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail card */}
      {p && (
        <>
          {/* Failed error message */}
          {p.status === "failed" && p.error_message && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 border border-red-200 px-4 py-3"
            >
              <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-1">
                Error
              </p>
              <p className="text-sm text-red-700 font-mono">{p.error_message}</p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm ring-1 ring-black/5 p-6">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <DetailRow label="ID">
                <span className="font-mono text-xs text-gray-700">{p.id}</span>
              </DetailRow>

              <DetailRow label="Org Slug">
                <span className="font-mono text-sm text-gray-900">
                  {p.org_slug}
                </span>
              </DetailRow>

              <DetailRow label="Customer Email">
                <span className="text-sm text-gray-900">{p.customer_email}</span>
              </DetailRow>

              <DetailRow label="Plan">
                <span className="text-sm text-gray-900 capitalize">
                  {p.plan}
                </span>
              </DetailRow>

              <DetailRow label="Status">
                <FleetStatusBadge status={p.status} />
              </DetailRow>

              <DetailRow label="Server IP">
                <span className="font-mono text-sm text-gray-700">
                  {p.hetzner_server_ip ?? "—"}
                </span>
              </DetailRow>

              <DetailRow label="Provisioned At">
                <span className="text-sm text-gray-700">
                  {formatDateTime(p.provisioned_at)}
                </span>
              </DetailRow>

              <DetailRow label="Created At">
                <span className="text-sm text-gray-700">
                  {formatDateTime(p.created_at)}
                </span>
              </DetailRow>

              <DetailRow label="Last Health Check">
                <span className="text-sm text-gray-700">
                  {formatDateTime(p.last_health_check_at)}
                </span>
              </DetailRow>

              <DetailRow label="Health Status">
                <span
                  className={clsx("text-sm font-medium capitalize", {
                    "text-emerald-600":
                      p.last_health_status === "healthy" ||
                      p.last_health_status === "ok",
                    "text-red-600":
                      p.last_health_status !== null &&
                      p.last_health_status !== "healthy" &&
                      p.last_health_status !== "ok",
                    "text-gray-400": p.last_health_status === null,
                  })}
                >
                  {p.last_health_status ?? "Unknown"}
                </span>
              </DetailRow>
            </dl>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              disabled={resetting}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              {resetting ? "Resetting..." : "Reset"}
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              disabled={
                p.status === "deprovisioned" ||
                p.status === "deprovisioning" ||
                deprovisioning
              }
              className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Deprovision
            </button>
          </div>
        </>
      )}

      {showConfirm && (
        <ConfirmDeprovisionDialog
          slug={slug}
          onConfirm={handleDeprovisionConfirm}
          onCancel={() => setShowConfirm(false)}
          pending={deprovisioning}
        />
      )}
    </div>
  );
}
