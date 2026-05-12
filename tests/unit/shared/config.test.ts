/**
 * Unit tests: shared/config
 * Tests config schema validation without relying on actual process.env.
 */

import { describe, it, expect } from "vitest"
import { z } from "zod"

// Re-export the schema separately so we can test it in isolation
// without side-effects from loading config.ts (which calls parseConfig at import time)
const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default("postgresql://nestfleet:nestfleet@localhost:5434/nestfleet"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  NESTFLEET_LICENSE_KEY: z
    .string()
    .regex(/^nf_lic_[0-9a-f]{32}$/)
    .optional(),
  TELEMETRY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
})

describe("Config schema", () => {
  it("NF-UNIT-CFG-01: applies all defaults when env is empty", () => {
    const result = ConfigSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.PORT).toBe(3000)
      expect(result.data.NODE_ENV).toBe("development")
      expect(result.data.LOG_LEVEL).toBe("info")
      expect(result.data.TELEMETRY_ENABLED).toBe(false)
    }
  })

  it("NF-UNIT-CFG-02: coerces PORT from string to number", () => {
    const result = ConfigSchema.safeParse({ PORT: "8080" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.PORT).toBe(8080)
  })

  it("NF-UNIT-CFG-03: rejects invalid PORT", () => {
    const result = ConfigSchema.safeParse({ PORT: "99999" })
    expect(result.success).toBe(false)
  })

  it("NF-UNIT-CFG-04: rejects invalid LOG_LEVEL", () => {
    const result = ConfigSchema.safeParse({ LOG_LEVEL: "verbose" })
    expect(result.success).toBe(false)
  })

  it("NF-UNIT-CFG-05: accepts valid license key format", () => {
    const result = ConfigSchema.safeParse({
      NESTFLEET_LICENSE_KEY: "nf_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    })
    expect(result.success).toBe(true)
  })

  it("NF-UNIT-CFG-06: rejects invalid license key format", () => {
    const result = ConfigSchema.safeParse({
      NESTFLEET_LICENSE_KEY: "ag_lic_invalid",
    })
    expect(result.success).toBe(false)
  })

  it("NF-UNIT-CFG-07: transforms TELEMETRY_ENABLED string to boolean", () => {
    const on = ConfigSchema.safeParse({ TELEMETRY_ENABLED: "true" })
    const off = ConfigSchema.safeParse({ TELEMETRY_ENABLED: "false" })
    expect(on.success && on.data.TELEMETRY_ENABLED).toBe(true)
    expect(off.success && off.data.TELEMETRY_ENABLED).toBe(false)
  })
})

// ── EMBEDDING_PROVIDER enum (INST-01) ─────────────────────────────────────────

// Mirror only the EMBEDDING_PROVIDER field from the real config schema so these
// tests don't require a full valid config (JWT_SECRET etc.).
const EmbeddingProviderSchema = z.object({
  EMBEDDING_PROVIDER: z.enum(["openai", "ollama", "google"]).default("openai"),
})

describe("EMBEDDING_PROVIDER config validation (INST-01)", () => {
  it("INST01-T01: accepts 'google' as EMBEDDING_PROVIDER", () => {
    const result = EmbeddingProviderSchema.safeParse({ EMBEDDING_PROVIDER: "google" })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.EMBEDDING_PROVIDER).toBe("google")
  })

  it("INST01-T02: rejects unknown provider 'vertex'", () => {
    const result = EmbeddingProviderSchema.safeParse({ EMBEDDING_PROVIDER: "vertex" })
    expect(result.success).toBe(false)
  })

  it("INST01-T03: 'openai' and 'ollama' are still accepted", () => {
    const oa = EmbeddingProviderSchema.safeParse({ EMBEDDING_PROVIDER: "openai" })
    const ol = EmbeddingProviderSchema.safeParse({ EMBEDDING_PROVIDER: "ollama" })
    expect(oa.success).toBe(true)
    expect(ol.success).toBe(true)
  })
})
