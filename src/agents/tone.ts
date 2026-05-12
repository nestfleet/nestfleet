// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Agent tone preamble — SLICE-11.
 *
 * Prepends a tone instruction to the system prompt based on the
 * product's agent_config.tone setting.
 */

const TONE_PREAMBLES: Record<string, string> = {
  formal:
    "Communicate in a professional, structured manner. Use complete sentences, " +
    "avoid colloquialisms, and maintain a business-appropriate tone throughout.",
  friendly:
    "Communicate in a warm, conversational style. Be approachable and empathetic " +
    "while remaining helpful and clear. Use natural language as if speaking to a colleague.",
  technical:
    "Communicate in a precise, detail-oriented style suitable for a technical audience. " +
    "Use exact terminology, include relevant technical context, and be concise.",
}

/**
 * Prepend a tone instruction to a system prompt.
 * If tone is not recognized, returns the original prompt unchanged.
 */
export function withTone(systemPrompt: string, tone: string): string {
  const preamble = TONE_PREAMBLES[tone]
  if (!preamble) return systemPrompt
  return `Communication style: ${preamble}\n\n${systemPrompt}`
}
