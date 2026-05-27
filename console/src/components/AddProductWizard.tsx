// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

"use client";

/**
 * AddProductWizard — DEFERRED-21 P6.
 *
 * A three-step modal wizard for creating a new product:
 *   Step 1: Enter product name
 *   Step 2: Choose launch stage
 *   Step 3: Confirm and create
 *
 * Tier gate: the trigger button is disabled (with tooltip) when the user has
 * reached their plan's product limit. For Community tier (productLimit === 1)
 * the button is hidden entirely via the parent component.
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Modal } from "./Modal";
import { createProductApi, ApiError } from "@/lib/api";
import { useLicense } from "@/lib/useLicense";
import { useProducts, useRefreshProducts } from "@/lib/product-context";
import { ChannelPickerStep } from "./ChannelPickerStep";

type Stage = "pre-launch" | "beta" | "production";

const STAGES: { value: Stage; label: string; description: string }[] = [
  {
    value: "pre-launch",
    label: "Pre-launch",
    description: "Still building — internal testing only",
  },
  {
    value: "beta",
    label: "Beta",
    description: "Early adopters, limited rollout",
  },
  {
    value: "production",
    label: "Production",
    description: "Fully live, all users",
  },
];

type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  name:             string;
  stage:            Stage;
  enabledChannels:  string[];
}

// ─── Trigger button with tier gate ───────────────────────────────────────────

interface AddProductButtonProps {
  onClick: () => void;
}

export function AddProductButton({ onClick }: AddProductButtonProps) {
  const { license } = useLicense();
  const products = useProducts();

  const productLimit = license?.productLimit ?? null;
  const canAdd =
    productLimit === null || products.length < productLimit;

  // At limit — hide the button entirely (no disabled ghost that confuses users)
  if (!canAdd) return null;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      Add Product
    </button>
  );
}

// ─── Wizard modal ─────────────────────────────────────────────────────────────

interface AddProductWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddProductWizard({ isOpen, onClose }: AddProductWizardProps) {
  const router = useRouter();
  const refreshProducts = useRefreshProducts();

  const [step, setStep] = useState<WizardStep>(1);
  const [form, setForm] = useState<WizardState>({ name: "", stage: "production", enabledChannels: [] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setForm({ name: "", stage: "production", enabledChannels: [] });
    setError(null);
    setIsSubmitting(false);
    setCreatedSlug(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Step navigation ─────────────────────────────────────────────────────────

  const handleNext = useCallback(() => {
    if (step === 1) {
      if (!form.name.trim()) {
        setError("Product name is required.");
        return;
      }
      if (form.name.trim().length < 2) {
        setError("Name must be at least 2 characters.");
        return;
      }
      if (form.name.trim().length > 60) {
        setError("Name must be 60 characters or fewer.");
        return;
      }
      setError(null);
      setStep(2);
    } else if (step === 2) {
      setError(null);
      setStep(3);
    } else if (step === 3) {
      setError(null);
      setStep(4);
    }
  }, [step, form.name]);

  const handleBack = useCallback(() => {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s));
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createProductApi({
        name: form.name.trim(),
        stage: form.stage,
      });
      if (!result.ok) {
        setError("Failed to create product. Please try again.");
        return;
      }
      const newSlug = result.product.slug;
      // Swap in the fresh token (includes new productId) before navigating
      // so ProductProvider finds the new product on its first fetch.
      if (result.token) {
        localStorage.setItem("nestfleet_token", result.token);
      }
      refreshProducts();
      setCreatedSlug(newSlug);
      setStep(5);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError(err.message); // "Product limit reached (N/N). Upgrade your license..."
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [form, refreshProducts, handleClose, router]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const stepTitle: Record<WizardStep, string> = {
    1: "Name your product",
    2: "Choose a launch stage",
    3: "Enable channels",
    4: "Confirm new product",
    5: "Product ready",
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={stepTitle[step]}>
      {/* Progress indicator — hidden on step 5 (success screen) */}
      {step < 5 && <div className="mb-6 flex items-center gap-2">
        {([1, 2, 3, 4] as WizardStep[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={clsx(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                s < step
                  ? "bg-indigo-600 text-white"
                  : s === step
                  ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400"
                  : "bg-gray-100 text-gray-400"
              )}
            >
              {s < step ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                s
              )}
            </div>
            {s < 4 && (
              <div
                className={clsx(
                  "h-0.5 w-8",
                  s < step ? "bg-indigo-600" : "bg-gray-200"
                )}
              />
            )}
          </div>
        ))}
      </div>}

      {/* Step 1 — Name */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 mb-1">
              Product name
            </label>
            <input
              id="product-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleNext(); }}
              placeholder="e.g. Acme, Acme Corp"
              maxLength={60}
              autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              {form.name.trim().length}/60 characters
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={handleClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleNext}
              disabled={!form.name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Stage */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            {STAGES.map(({ value, label, description }) => (
              <label
                key={value}
                className={clsx(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  form.stage === value
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                )}
              >
                <input
                  type="radio"
                  name="stage"
                  value={value}
                  checked={form.stage === value}
                  onChange={() => setForm((f) => ({ ...f, stage: value }))}
                  className="mt-0.5 h-4 w-4 accent-indigo-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-between pt-2">
            <button
              onClick={handleBack}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Channels */}
      {step === 3 && (
        <div className="space-y-4">
          <ChannelPickerStep
            selected={form.enabledChannels}
            onChange={(ids) => setForm((f) => ({ ...f, enabledChannels: ids }))}
            skippable
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-between pt-2">
            <button
              onClick={handleBack}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Confirm */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Name</span>
              <span className="font-medium text-gray-900">{form.name.trim()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Stage</span>
              <span className="font-medium text-gray-900 capitalize">
                {STAGES.find((s) => s.value === form.stage)?.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Channels</span>
              <span className="font-medium text-gray-900">
                {form.enabledChannels.length === 0
                  ? "None (configure later)"
                  : form.enabledChannels.join(", ")}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            A URL-friendly slug will be generated from the product name. You can change it later in Settings.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-between pt-2">
            <button
              onClick={handleBack}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={handleCreate}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isSubmitting ? "Creating…" : "Create Product"}
            </button>
          </div>
        </div>
      )}
      {/* Step 5 — Next steps (product already created) */}
      {step === 5 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            Recommended next steps to get the best out of your AI agents:
          </p>

          {/* Primary CTA — KB sources */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-3">
            <span className="text-xl leading-none mt-0.5">📚</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Add knowledge sources</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Agents answer from your knowledge base — add docs, FAQs, or known issues now for best triage quality.
              </p>
            </div>
            <button
              onClick={() => { handleClose(); router.push(`/p/${createdSlug}/knowledge`); }}
              className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              Add sources →
            </button>
          </div>

          {/* Secondary steps */}
          <div className="space-y-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center gap-3">
              <span className="text-lg leading-none">👥</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">Invite your team</p>
                <p className="text-xs text-gray-400">Settings → Roles &amp; Permissions</p>
              </div>
              <button
                onClick={() => { handleClose(); router.push(`/settings?section=roles`); }}
                className="shrink-0 text-xs text-indigo-600 hover:underline"
              >
                Go →
              </button>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center gap-3">
              <span className="text-lg leading-none">🔔</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">Configure notifications</p>
                <p className="text-xs text-gray-400">Settings → Notifications</p>
              </div>
              <button
                onClick={() => { handleClose(); router.push(`/settings?section=notifications`); }}
                className="shrink-0 text-xs text-indigo-600 hover:underline"
              >
                Go →
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => { handleClose(); router.push(`/p/${createdSlug}/cases`); }}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Go to Dashboard →
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
