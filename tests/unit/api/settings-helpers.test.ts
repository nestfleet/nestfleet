/**
 * Unit tests for helper logic in settings.ts — SLICE-11.
 * NF-UNIT-60+
 *
 * maskApiKey and buildSettingsResponse are not exported, so pure logic
 * is mirrored here for testability.
 */

import { describe, it, expect } from "vitest"

const EMBEDDING_DEFAULTS: Record<string, { model: string; dimensions: number }> = {
  openai:         { model: "text-embedding-3-small", dimensions: 768 },
  anthropic:      { model: "text-embedding-3-small", dimensions: 768 },
  google:         { model: "text-embedding-004",     dimensions: 768 },
  "azure-openai": { model: "text-embedding-3-small", dimensions: 768 },
  "self-hosted":  { model: "nomic-embed-text",       dimensions: 768 },
}

function maskApiKey(key: string | undefined): string | null {
  if (!key || key.length < 8) return null
  return `****${key.slice(-4)}`
}

describe("maskApiKey()", () => {
  it("NF-UNIT-60: masks valid key showing last 4 chars", () => {
    expect(maskApiKey("sk-abcdefghijklmnop")).toBe("****mnop")
  })

  it("NF-UNIT-61: returns null for undefined", () => {
    expect(maskApiKey(undefined)).toBeNull()
  })

  it("NF-UNIT-62: returns null for key < 8 chars", () => {
    expect(maskApiKey("short")).toBeNull()
  })

  it("NF-UNIT-68: returns null for 'admin' — the setup-wizard placeholder bug", () => {
    expect(maskApiKey("admin")).toBeNull()
  })

  it("NF-UNIT-63: accepts exactly 8 char key", () => {
    expect(maskApiKey("abcd1234")).toBe("****1234")
  })
})

describe("EMBEDDING_DEFAULTS", () => {
  it("NF-UNIT-64: all 5 providers have model and dimensions", () => {
    for (const p of ["openai", "anthropic", "google", "azure-openai", "self-hosted"]) {
      expect(EMBEDDING_DEFAULTS[p]).toBeDefined()
      expect(typeof EMBEDDING_DEFAULTS[p].model).toBe("string")
      expect(EMBEDDING_DEFAULTS[p].dimensions).toBeGreaterThanOrEqual(64)
    }
  })

  it("NF-UNIT-65: google uses text-embedding-004", () => {
    expect(EMBEDDING_DEFAULTS["google"].model).toBe("text-embedding-004")
  })

  it("NF-UNIT-66: self-hosted uses nomic-embed-text", () => {
    expect(EMBEDDING_DEFAULTS["self-hosted"].model).toBe("nomic-embed-text")
  })

  it("NF-UNIT-67: all providers default to 768 dimensions", () => {
    for (const p of Object.values(EMBEDDING_DEFAULTS)) {
      expect(p.dimensions).toBe(768)
    }
  })
})
