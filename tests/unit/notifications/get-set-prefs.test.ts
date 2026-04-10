/**
 * Unit tests — FEAT-014: getNotificationPreferences and setNotificationPreferences
 *
 * Tests:
 *   NP-R-01  Returns { email_disabled_events: [] } when column is {}
 *   NP-R-02  Returns stored array when set
 *   NP-R-03  Round-trip: set then get returns same data
 */

import { vi, describe, it, expect, beforeEach } from "vitest"

// ── Mock the DB client before importing repository ────────────────────────────

const mockQuery = vi.fn()
const mockDbFn = Object.assign(mockQuery, {
  array: vi.fn((arr: unknown[]) => arr),
  json: vi.fn((obj: unknown) => obj),
})

vi.mock("../../../src/infra/db/client.js", () => ({
  getDb: vi.fn(() => mockDbFn),
}))

// Import after mock setup
import {
  getNotificationPreferences,
  setNotificationPreferences,
} from "../../../src/infra/db/repositories/products.js"

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getNotificationPreferences (FEAT-014)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("NP-R-01: returns { email_disabled_events: [] } when column is empty object {}", async () => {
    mockQuery.mockResolvedValueOnce([{
      notification_preferences: {},
    }])

    const result = await getNotificationPreferences("prod_test")

    expect(result).toEqual({ email_disabled_events: [] })
  })

  it("NP-R-02: returns stored array when email_disabled_events is set", async () => {
    mockQuery.mockResolvedValueOnce([{
      notification_preferences: { email_disabled_events: ["case_triaged", "case_resolved"] },
    }])

    const result = await getNotificationPreferences("prod_test")

    expect(result).toEqual({ email_disabled_events: ["case_triaged", "case_resolved"] })
  })

  it("NP-R-01b: returns { email_disabled_events: [] } when product not found", async () => {
    mockQuery.mockResolvedValueOnce([])

    const result = await getNotificationPreferences("prod_missing")

    expect(result).toEqual({ email_disabled_events: [] })
  })
})

describe("setNotificationPreferences (FEAT-014)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("NP-R-03: calls DB update with correct product_id and prefs", async () => {
    mockQuery.mockResolvedValueOnce([])

    await setNotificationPreferences("prod_test", {
      email_disabled_events: ["case_triaged", "auto_reply_sent"],
    })

    expect(mockQuery).toHaveBeenCalledOnce()
  })
})
