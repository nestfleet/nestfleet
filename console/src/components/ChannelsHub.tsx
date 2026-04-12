// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * ChannelsHub — FEAT-002 Channels Hub.
 *
 * Renders a grid of ChannelCards for all channels (active + upcoming).
 * Opens ChannelSetupPanel when the user clicks "Configure" or "Set up".
 * Uses SWR to fetch live status from GET /api/v1/products/:id/channels/status.
 */

import { useState } from "react";
import useSWR from "swr";
import { CHANNEL_CATALOG, ACTIVE_CHANNELS, UPCOMING_CHANNELS, type ChannelStatus } from "@/lib/channel-catalog";
import { getChannelStatusApi } from "@/lib/api";
import { ChannelCard } from "./ChannelCard";
import { ChannelSetupPanel } from "./ChannelSetupPanel";

interface ChannelsHubProps {
  productId: string;
}

export function ChannelsHub({ productId }: ChannelsHubProps) {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const { data, isLoading } = useSWR(
    productId ? ["channels-status", productId] : null,
    () => getChannelStatusApi(productId),
    { refreshInterval: 30_000 },
  );

  function getStatus(channelId: string): ChannelStatus {
    const ch = CHANNEL_CATALOG.find((c) => c.id === channelId);
    if (!ch?.available) return "coming_soon";
    const info = data?.channels?.[channelId];
    if (!info) return "not_configured";
    return info.status as ChannelStatus;
  }

  function getLastEventAt(channelId: string): string | null {
    return data?.channels?.[channelId]?.lastEventAt ?? null;
  }

  return (
    <div className="space-y-6">
      {/* Active channels */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
          Available
        </h3>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTIVE_CHANNELS.map((ch) => (
              <div key={ch.id} className="h-28 rounded-lg bg-gray-50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ACTIVE_CHANNELS.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                status={getStatus(ch.id)}
                lastEventAt={getLastEventAt(ch.id)}
                onConfigure={setSelectedChannelId}
              />
            ))}
          </div>
        )}
      </section>

      {/* Coming soon */}
      {UPCOMING_CHANNELS.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Coming soon
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {UPCOMING_CHANNELS.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                status="coming_soon"
                lastEventAt={null}
                onConfigure={setSelectedChannelId}
              />
            ))}
          </div>
        </section>
      )}

      {/* Setup panel slide-over */}
      <ChannelSetupPanel
        channelId={selectedChannelId}
        onClose={() => setSelectedChannelId(null)}
        productId={productId}
      />
    </div>
  );
}
