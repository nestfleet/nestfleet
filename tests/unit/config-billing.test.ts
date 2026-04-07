/**
 * NF-PIVOT Phase 1: config.BILLING_ENABLED field.
 *
 * NF-PIV-05  config.BILLING_ENABLED exists and defaults to false
 *
 * This test FAILS until BILLING_ENABLED is added to src/shared/config.ts.
 */

import { describe, it, expect } from "vitest"
import { config } from "../../src/shared/config.js"

describe("NF-PIV-05: config.BILLING_ENABLED", () => {
  it("BILLING_ENABLED field exists on config and defaults to false", () => {
    const cfg = config as unknown as Record<string, unknown>
    expect("BILLING_ENABLED" in cfg).toBe(true)
    expect(cfg["BILLING_ENABLED"]).toBe(false)
  })
})
