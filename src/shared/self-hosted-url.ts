// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * One URL convention for the "Self-Hosted" LLM provider (Ollama, vLLM, LiteLLM, …).
 *
 * Users type whatever they have: a bare host ("http://ollama:11434", what the console
 * form suggests), an OpenAI-style ".../v1", or the legacy Ollama-native ".../api".
 * Two kinds of endpoints are called and each needs a different base:
 *   - openaiBase — OpenAI-compatible API (/chat/completions, /models): agents + Test Connection
 *   - nativeBase — Ollama-native API (/api/embed, /api/tags, /api/generate): embeddings + model listing
 *
 * Rules: bare host or "/api" → openaiBase gets "/v1"; a path ending in "/v1" is kept for
 * openaiBase (and stripped for nativeBase); any other path is used as given (never rewritten).
 * Unset → local Ollama; the default is deliberately local so a missing URL fails to connect
 * instead of reaching a real vendor endpoint.
 */

export const SELF_HOSTED_DEFAULT_HOST = "http://127.0.0.1:11434"

export interface SelfHostedUrls {
  /** Base for OpenAI-compatible calls, e.g. "http://host:11434/v1". */
  openaiBase: string
  /** Base for Ollama-native calls, e.g. "http://host:11434". */
  nativeBase: string
}

export function resolveSelfHostedUrls(input: string | undefined): SelfHostedUrls {
  const trimmed = input?.trim().replace(/\/+$/, "") ?? ""
  if (!trimmed) {
    return { openaiBase: `${SELF_HOSTED_DEFAULT_HOST}/v1`, nativeBase: SELF_HOSTED_DEFAULT_HOST }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    // Not a parseable URL — pass through so the request fails visibly.
    return { openaiBase: trimmed, nativeBase: trimmed }
  }
  // Query strings / fragments mean a deliberate custom endpoint — never rewrite it.
  if (url.search || url.hash) return { openaiBase: trimmed, nativeBase: trimmed }

  const path = url.pathname.replace(/\/+$/, "")

  if (path === "") {
    return { openaiBase: `${trimmed}/v1`, nativeBase: trimmed }
  }
  if (path === "/api") {
    const host = trimmed.slice(0, -"/api".length)
    return { openaiBase: `${host}/v1`, nativeBase: host }
  }
  if (path.endsWith("/v1")) {
    return { openaiBase: trimmed, nativeBase: trimmed.slice(0, -"/v1".length) }
  }
  return { openaiBase: trimmed, nativeBase: trimmed }
}
