// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Range enforcement for LLM structured output — done in code, not by the model.
 *
 * Ollama's llama.cpp grammar enforces JSON shape/types/enums but NOT numeric min/max, so a
 * self-hosted model can return well-formed but out-of-range numbers (measured: 84.19 and 1.10 for a
 * 0–1 field). Rejecting the whole agent run for that wastes a job attempt; instead the value is
 * normalised before validation. The JSON schema sent to providers is deliberately left unchanged.
 *
 * Every rule fails SAFE for the downstream gates (triage: critical needs ≥ 0.75, high ≥ 0.60;
 * known-issue match ≥ 0.80; auto-reply needs tier 1): an unusable value becomes "low confidence"
 * (→ human review) and is never scaled up or guessed.
 */

import { z } from "zod"
import { logger } from "../shared/logger.js"

/** Values in (1, 1.2] are float/rounding overshoot ("1.10") and clamp to 1; anything beyond is untrusted. */
export const CONFIDENCE_OVERSHOOT_TOLERANCE = 1.2

/**
 * Map a raw model confidence into [0, 1].
 * - in [0, 1]                → unchanged
 * - (1, 1.2]                 → 1
 * - negative / > 1.2 / NaN / ±Infinity → 0. A value like 84.19 could be a percent — but guessing the
 *   scale could push a wrong severity past a gate, so it is treated as low confidence instead.
 */
export function normaliseConfidence(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0
  if (raw <= 1) return raw
  if (raw <= CONFIDENCE_OVERSHOOT_TOLERANCE) return 1
  return 0
}

/** Keep only valid source tiers (integers 1–4). Dropping entries can never add tier 1. */
export function normaliseSourceTiers(raw: number[]): number[] {
  return raw.filter((t) => Number.isInteger(t) && t >= 1 && t <= 4)
}

/**
 * Shared `confidenceScore` field for agent output schemas.
 *
 * `z.preprocess` normalises the raw value BEFORE the range check, so validation never rejects an
 * out-of-range number — while the JSON schema sent to the provider is unchanged (`minimum: 0`,
 * `maximum: 1`, verified). Cloud providers that honour those keywords keep behaving exactly as
 * before; Ollama, which ignores them, no longer fails the run when it returns e.g. 84.19.
 * Non-numbers pass through untouched and still fail `z.number()`.
 */
export function confidenceScoreSchema(description: string): z.ZodType<number, z.ZodTypeDef, number> {
  // preprocess types its input as `unknown`; the contract with the model is a number, and
  // runAgent's generics need input === output, so the accurate input type is declared here.
  return z.preprocess((raw) => {
    if (typeof raw !== "number") return raw
    const normalised = normaliseConfidence(raw)
    if (normalised !== raw) {
      logger.warn(
        { rawConfidence: raw, normalisedConfidence: normalised },
        "LLM confidenceScore outside 0-1 — normalised (fails safe to low confidence)",
      )
    }
    return normalised
  }, z.number().min(0).max(1).describe(description)) as z.ZodType<number, z.ZodTypeDef, number>
}

/** Shared `sourceTiers` field (auto-reply). Same approach: wire schema unchanged (integer 1–4 items). */
export function sourceTiersSchema(description: string): z.ZodType<number[], z.ZodTypeDef, number[]> {
  return z.preprocess((raw) => {
    if (!Array.isArray(raw) || !raw.every((t) => typeof t === "number")) return raw
    const tiers = normaliseSourceTiers(raw)
    if (tiers.length !== raw.length) {
      logger.warn({ rawSourceTiers: raw, sourceTiers: tiers }, "LLM sourceTiers contained invalid entries — dropped")
    }
    return tiers
  }, z.array(z.number().int().min(1).max(4)).describe(description)) as z.ZodType<number[], z.ZodTypeDef, number[]>
}
