// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * Notification Preferences Settings — FEAT-014.
 *
 * Renders two grouped sections:
 *   - Requires Action (email on by default)
 *   - Informational (console-only by default)
 *
 * Auto-saves on toggle with 300ms debounce + optimistic update.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import {
  getNotificationPrefsApi,
  putNotificationPrefsApi,
} from "@/lib/api";
import { useProductIdWithFallback } from "@/lib/product-context";
import { useToast } from "@/components/Toast";

// ── Event catalogue ───────────────────────────────────────────────────────────

interface EventDef {
  kind: string;
  label: string;
  description: string;
  defaultEmailOn: boolean;
}

const REQUIRES_ACTION_EVENTS: EventDef[] = [
  {
    kind: "approval_request",
    label: "CR Approval Requested",
    description: "A change request is waiting for your approval.",
    defaultEmailOn: true,
  },
  {
    kind: "escalation_alert",
    label: "Case Escalated to Lead",
    description: "A case has been escalated and requires lead attention.",
    defaultEmailOn: true,
  },
  {
    kind: "stale_case_alert",
    label: "Case Processing Failed",
    description: "A case could not be processed automatically.",
    defaultEmailOn: true,
  },
  {
    kind: "stale_change_alert",
    label: "Change Request Rejected",
    description: "A change request has been rejected and requires review.",
    defaultEmailOn: true,
  },
];

const INFORMATIONAL_EVENTS: EventDef[] = [
  {
    kind: "status_update",
    label: "Case Triaged",
    description: "A case has been successfully triaged by the AI.",
    defaultEmailOn: false,
  },
  {
    kind: "reminder",
    label: "Case Resolved",
    description: "A case has been marked as resolved.",
    defaultEmailOn: false,
  },
  {
    kind: "digest_summary",
    label: "Awaiting User Response",
    description: "A case is waiting for a response from the end user.",
    defaultEmailOn: false,
  },
  {
    kind: "user_follow_up",
    label: "Auto-Reply Sent",
    description: "An automated reply was sent to the end user.",
    defaultEmailOn: false,
  },
  {
    kind: "clarification_request",
    label: "Draft Reply Sent",
    description: "A draft reply was sent for operator review.",
    defaultEmailOn: false,
  },
  {
    kind: "pr_ready",
    label: "Change Request Approved",
    description: "A change request has been approved.",
    defaultEmailOn: false,
  },
  {
    kind: "resolution_message",
    label: "PR Drafted",
    description: "A pull request draft has been created.",
    defaultEmailOn: false,
  },
];

const ALL_EVENTS = [...REQUIRES_ACTION_EVENTS, ...INFORMATIONAL_EVENTS];

// ── Toggle component ──────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
        checked ? "bg-indigo-600" : "bg-gray-200",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0",
          "transition duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────

interface EventRowProps {
  event: EventDef;
  emailEnabled: boolean;
  onToggle: (kind: string, emailEnabled: boolean) => void;
  saving: boolean;
}

function EventRow({ event, emailEnabled, onToggle, saving }: EventRowProps) {
  return (
    <li className="flex items-center justify-between py-3">
      <div className="min-w-0 flex-1 pr-4">
        <p className="text-sm font-medium text-gray-900">{event.label}</p>
        <p className="mt-0.5 text-xs text-gray-500">{event.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-gray-500 hidden sm:inline">
          {emailEnabled ? "Email" : "Console only"}
        </span>
        <Toggle
          checked={emailEnabled}
          onChange={(checked) => onToggle(event.kind, checked)}
          disabled={saving}
        />
      </div>
    </li>
  );
}

// ── Section group ─────────────────────────────────────────────────────────────

interface EventGroupProps {
  title: string;
  description: string;
  events: EventDef[];
  disabledSet: Set<string>;
  onToggle: (kind: string, emailEnabled: boolean) => void;
  saving: boolean;
}

function EventGroup({ title, description, events, disabledSet, onToggle, saving }: EventGroupProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <ul className="divide-y divide-gray-100 px-4">
        {events.map((event) => (
          <EventRow
            key={event.kind}
            event={event}
            emailEnabled={!disabledSet.has(event.kind)}
            onToggle={onToggle}
            saving={saving}
          />
        ))}
      </ul>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationPreferencesPage() {
  const productId = useProductIdWithFallback();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disabledSet, setDisabledSet] = useState<Set<string>>(
    () => new Set(ALL_EVENTS.filter((e) => !e.defaultEmailOn).map((e) => e.kind)),
  );

  // Debounce timer ref
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending disabled list to save (latest value)
  const pendingDisabledRef = useRef<string[]>([]);

  // Load current prefs on mount / product change
  useEffect(() => {
    if (!productId) return;

    let cancelled = false;
    setLoading(true);

    getNotificationPrefsApi(productId)
      .then((res) => {
        if (cancelled) return;
        const disabled = res.data.email_disabled_events ?? [];
        setDisabledSet(new Set(disabled));
      })
      .catch(() => {
        if (cancelled) return;
        // Keep defaults on error — non-fatal
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Debounced save
  const scheduleSave = useCallback(
    (newDisabledList: string[]) => {
      pendingDisabledRef.current = newDisabledList;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        if (!productId) return;
        setSaving(true);
        try {
          await putNotificationPrefsApi(productId, {
            email_disabled_events: pendingDisabledRef.current,
          });
          toast("Notification preferences saved.", "success");
        } catch {
          toast("Failed to save preferences. Please try again.", "error");
        } finally {
          setSaving(false);
        }
      }, 300);
    },
    [productId, toast],
  );

  const handleToggle = useCallback(
    (kind: string, emailEnabled: boolean) => {
      setDisabledSet((prev) => {
        const next = new Set(prev);
        if (emailEnabled) {
          next.delete(kind);
        } else {
          next.add(kind);
        }
        scheduleSave(Array.from(next));
        return next;
      });
    },
    [scheduleSave],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Back link */}
        <button
          onClick={() => { window.location.href = "/settings?section=notifications"; }}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Settings
        </button>

        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Notification Preferences</h1>
          <p className="mt-1 text-sm text-gray-500">
            Control which events send email notifications. Disabled events still appear in the
            console inbox.
          </p>
        </div>

        {/* Status indicator */}
        {saving && (
          <div className="text-xs text-indigo-600 font-medium animate-pulse">Saving...</div>
        )}

        {loading ? (
          <div className="text-sm text-gray-400">Loading preferences...</div>
        ) : (
          <div className="space-y-6">
            <EventGroup
              title="Requires Action"
              description="High-priority events that typically need your attention. Email is on by default."
              events={REQUIRES_ACTION_EVENTS}
              disabledSet={disabledSet}
              onToggle={handleToggle}
              saving={saving}
            />
            <EventGroup
              title="Informational"
              description="Status updates and completions. Console inbox only by default."
              events={INFORMATIONAL_EVENTS}
              disabledSet={disabledSet}
              onToggle={handleToggle}
              saving={saving}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
