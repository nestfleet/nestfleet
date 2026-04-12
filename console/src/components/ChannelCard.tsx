// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * ChannelCard — displays one channel's status in the Channels Hub grid.
 *
 * Usage:
 *   <ChannelCard
 *     channel={CHANNEL_CATALOG[0]}
 *     status="connected"
 *     lastEventAt="2024-01-15T10:30:00Z"
 *     onConfigure={(id) => openPanel(id)}
 *   />
 */

import type { ChannelDefinition } from "@/lib/channel-catalog";
import type { ChannelStatus } from "@/lib/channel-catalog";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChannelCardProps {
  channel:     ChannelDefinition;
  status:      ChannelStatus;
  lastEventAt: string | null;
  onConfigure: (channelId: string) => void;
}

// ─── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ChannelStatus,
  { dot: string; label: string; classes: string }
> = {
  connected:      { dot: "●", label: "Connected",   classes: "text-green-700 bg-green-50" },
  no_events:      { dot: "⚠",  label: "No events",   classes: "text-amber-700 bg-amber-50" },
  not_configured: { dot: "○", label: "Not set up",  classes: "text-gray-500 bg-gray-100" },
  coming_soon:    { dot: "✦", label: "Coming soon", classes: "text-purple-700 bg-purple-50" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ChannelCard({ channel, status, lastEventAt, onConfigure }: ChannelCardProps) {
  const badge = STATUS_CONFIG[status];

  const isAvailable = status !== "coming_soon";
  const buttonLabel =
    status === "connected" || status === "no_events" ? "Configure" : "Set up";

  return (
    <article
      className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col gap-3"
      aria-label={`${channel.name} channel — ${badge.label}`}
    >
      {/* ── Header row ── */}
      <div className="flex items-center gap-2">
        <span className="text-2xl" role="img" aria-label={channel.name}>
          {channel.icon}
        </span>
        <span className="text-sm font-semibold text-gray-900 leading-tight">
          {channel.name}
        </span>
        {/* Status badge — pushed to the right */}
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badge.classes}`}
          aria-label={`Status: ${badge.label}`}
        >
          <span aria-hidden="true">{badge.dot}</span>
          {badge.label}
        </span>
      </div>

      {/* ── Description ── */}
      <p className="text-sm text-gray-500 leading-snug">{channel.description}</p>

      {/* ── Last event ── */}
      {lastEventAt && (
        <p className="text-xs text-gray-400">
          Last event: {relativeTime(lastEventAt)}
        </p>
      )}

      {/* ── Footer ── */}
      <div className="mt-auto pt-1">
        {isAvailable ? (
          <button
            type="button"
            onClick={() => onConfigure(channel.id)}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
            aria-label={`${buttonLabel} ${channel.name}`}
          >
            {buttonLabel}
          </button>
        ) : (
          <span className="text-xs text-gray-400">Request early access</span>
        )}
      </div>
    </article>
  );
}
