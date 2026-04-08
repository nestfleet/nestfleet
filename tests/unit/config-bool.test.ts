/**
 * BEF-23: boolEnv preprocess fix.
 *
 * z.coerce.boolean() treats any non-empty string (including "false") as true.
 * boolEnv uses a preprocess that maps only the string "true" or boolean true → true,
 * everything else → false.
 *
 * These tests verify that string "false" (the value Docker Compose injects when
 * the env var is absent via ${VAR:-false}) is correctly parsed as boolean false.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// Snapshot env vars config.ts reads so we can restore after each test
const ENV_KEYS = [
  "BILLING_ENABLED",
  "REGISTRATION_ENABLED",
  "PROVISIONING_ENABLED",
  "TELEMETRY_OPT_IN",
] as const

type EnvKey = (typeof ENV_KEYS)[number]
type EnvSnapshot = Partial<Record<EnvKey, string | undefined>>

function snapshotEnv(): EnvSnapshot {
  const snap: EnvSnapshot = {}
  for (const key of ENV_KEYS) snap[key] = process.env[key]
  return snap
}

function restoreEnv(snap: EnvSnapshot) {
  for (const key of ENV_KEYS) {
    if (snap[key] === undefined) delete process.env[key]
    else process.env[key] = snap[key]
  }
}

async function loadConfig() {
  vi.resetModules()
  const mod = await import("../../src/shared/config.js")
  return mod.config
}

describe("BEF-23: boolEnv — string 'false' must parse as boolean false", () => {
  let snapshot: EnvSnapshot

  beforeEach(() => { snapshot = snapshotEnv() })
  afterEach(() => { restoreEnv(snapshot) })

  it('BILLING_ENABLED="false" → false (Docker Compose default injection)', async () => {
    process.env["BILLING_ENABLED"] = "false"
    const cfg = await loadConfig()
    expect(cfg.BILLING_ENABLED).toBe(false)
  })

  it('BILLING_ENABLED="true" → true', async () => {
    process.env["BILLING_ENABLED"] = "true"
    const cfg = await loadConfig()
    expect(cfg.BILLING_ENABLED).toBe(true)
  })

  it("BILLING_ENABLED unset → false (default)", async () => {
    delete process.env["BILLING_ENABLED"]
    const cfg = await loadConfig()
    expect(cfg.BILLING_ENABLED).toBe(false)
  })

  it('REGISTRATION_ENABLED="false" → false', async () => {
    process.env["REGISTRATION_ENABLED"] = "false"
    const cfg = await loadConfig()
    expect(cfg.REGISTRATION_ENABLED).toBe(false)
  })

  it('PROVISIONING_ENABLED="false" → false', async () => {
    process.env["PROVISIONING_ENABLED"] = "false"
    const cfg = await loadConfig()
    expect(cfg.PROVISIONING_ENABLED).toBe(false)
  })
})
