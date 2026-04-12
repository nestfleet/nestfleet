// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * ChannelPickerStep — FEAT-002 shared channel picker for wizards.
 *
 * Allows the user to select one or more channels to enable for a product.
 * Used in:
 *   - AddProductWizard step 3 (optional — user can skip)
 *   - setup/page.tsx step 3 (first channel)
 *
 * Props:
 *   selected    — controlled set of selected channel IDs
 *   onChange    — callback when selection changes
 *   multiSelect — allow multiple selections (default: true)
 *   skippable   — show "Skip for now" hint text (default: false)
 */

import clsx from "clsx";
import { ACTIVE_CHANNELS } from "@/lib/channel-catalog";
import type { ChannelDefinition } from "@/lib/channel-catalog";

interface ChannelPickerStepProps {
  selected:    string[];
  onChange:    (ids: string[]) => void;
  multiSelect?: boolean;
  skippable?:  boolean;
}

export function ChannelPickerStep({
  selected,
  onChange,
  multiSelect = true,
  skippable = false,
}: ChannelPickerStepProps) {
  function toggle(id: string) {
    if (multiSelect) {
      if (selected.includes(id)) {
        onChange(selected.filter((s) => s !== id));
      } else {
        onChange([...selected, id]);
      }
    } else {
      onChange(selected.includes(id) ? [] : [id]);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        Select the channels you want to enable. You can add more later in{" "}
        <span className="font-medium text-gray-900">Settings → Channels</span>.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ACTIVE_CHANNELS.map((ch: ChannelDefinition) => {
          const isSelected = selected.includes(ch.id);
          return (
            <button
              key={ch.id}
              type="button"
              onClick={() => toggle(ch.id)}
              className={clsx(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                isSelected
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
              )}
              aria-pressed={isSelected}
            >
              <span className="text-2xl leading-none mt-0.5" aria-hidden="true">
                {ch.icon}
              </span>
              <div className="min-w-0">
                <p className={clsx("text-sm font-medium", isSelected ? "text-indigo-800" : "text-gray-900")}>
                  {ch.name}
                </p>
                <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{ch.description}</p>
              </div>
              {isSelected && (
                <svg className="ml-auto h-4 w-4 shrink-0 text-indigo-600 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      {skippable && (
        <p className="text-xs text-gray-400 mt-1">
          You can skip this step and configure channels later in Settings.
        </p>
      )}
    </div>
  );
}
