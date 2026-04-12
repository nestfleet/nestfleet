/**
 * NF-UNIT-RL-01..03 — Rate limiter memory leak cleanup (SEC-RL1)
 *
 * Verifies that each rate limiter deletes expired entries from its map
 * when the check function is invoked, preventing unbounded memory growth.
 *
 * Test approach: populate each rate limiter map directly with expired entries
 * (resetAt = past timestamp), call the check function, assert the expired
 * entries are removed from the map.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  rateLimitMap     as contactFormRlMap,
  checkRateLimitForTest as checkContactFormRateLimit,
} from "../../../src/api/webhooks/contact-form.js"
import {
  sessionRateMap,
  ipRateMap,
  checkRateForTest as checkChatRate,
} from "../../../src/api/webhooks/chat.js"
import {
  magicLinkRlMap,
  checkMagicLinkRateLimitForTest as checkMagicLinkRateLimit,
} from "../../../src/fleet/api/saas-account.js"

describe("Rate limiter cleanup — expired entries are deleted (SEC-RL1)", () => {

  // ── NF-UNIT-RL-01: contact-form.ts ────────────────────────────────────────

  describe("NF-UNIT-RL-01: contact-form rateLimitMap cleanup", () => {
    beforeEach(() => contactFormRlMap.clear())

    it("deletes expired entry when checkRateLimit is called", () => {
      // Inject an already-expired entry
      const expiredKey = "prod_001:1.2.3.4"
      contactFormRlMap.set(expiredKey, { count: 5, resetAt: Date.now() - 1000 })
      expect(contactFormRlMap.has(expiredKey)).toBe(true)

      // Calling for the same key should evict the old entry
      checkContactFormRateLimit("prod_001", "1.2.3.4")

      // The expired entry is gone (replaced with fresh one, count reset to 1)
      const entry = contactFormRlMap.get(expiredKey)
      expect(entry?.count).toBe(1)          // fresh window started
    })

    it("does not delete an unexpired entry", () => {
      const key = "prod_002:5.6.7.8"
      contactFormRlMap.set(key, { count: 3, resetAt: Date.now() + 60_000 })

      checkContactFormRateLimit("prod_002", "5.6.7.8")

      // Entry still there, count incremented (not reset)
      const entry = contactFormRlMap.get(key)
      expect(entry?.count).toBe(4)
    })

    it("other expired keys are cleaned up during a call for a different key", () => {
      // Plant expired entries for other keys
      contactFormRlMap.set("p:stale1", { count: 1, resetAt: Date.now() - 5000 })
      contactFormRlMap.set("p:stale2", { count: 1, resetAt: Date.now() - 5000 })

      // Call for a NEW key — cleanup loop should evict the stale entries
      checkContactFormRateLimit("prod_003", "9.9.9.9")

      expect(contactFormRlMap.has("p:stale1")).toBe(false)
      expect(contactFormRlMap.has("p:stale2")).toBe(false)
    })
  })

  // ── NF-UNIT-RL-02: chat.ts (shared checkRate) ─────────────────────────────

  describe("NF-UNIT-RL-02: chat session/IP rate map cleanup", () => {
    beforeEach(() => {
      sessionRateMap.clear()
      ipRateMap.clear()
    })

    it("deletes expired session entry on checkRate", () => {
      sessionRateMap.set("sess_expired", { count: 10, resetAt: Date.now() - 1000 })
      checkChatRate(sessionRateMap, "sess_expired", 30)
      const entry = sessionRateMap.get("sess_expired")
      expect(entry?.count).toBe(1)   // fresh window
    })

    it("deletes expired IP entry on checkRate", () => {
      ipRateMap.set("10.0.0.1", { count: 60, resetAt: Date.now() - 500 })
      checkChatRate(ipRateMap, "10.0.0.1", 60)
      const entry = ipRateMap.get("10.0.0.1")
      expect(entry?.count).toBe(1)
    })

    it("cleans up other expired entries in the same map during a call", () => {
      sessionRateMap.set("s:stale1", { count: 1, resetAt: Date.now() - 2000 })
      sessionRateMap.set("s:stale2", { count: 1, resetAt: Date.now() - 2000 })

      checkChatRate(sessionRateMap, "sess_new", 30)

      expect(sessionRateMap.has("s:stale1")).toBe(false)
      expect(sessionRateMap.has("s:stale2")).toBe(false)
    })
  })

  // ── NF-UNIT-RL-03: saas-account.ts magicLinkRlMap cleanup ─────────────────

  describe("NF-UNIT-RL-03: saas-account magic-link rate map cleanup", () => {
    beforeEach(() => magicLinkRlMap.clear())

    it("deletes expired magic-link entry on check", () => {
      magicLinkRlMap.set("user@expired.com", { count: 3, resetAt: Date.now() - 1000 })
      checkMagicLinkRateLimit("user@expired.com")
      const entry = magicLinkRlMap.get("user@expired.com")
      expect(entry?.count).toBe(1)
    })

    it("cleans up other expired magic-link entries during a call", () => {
      magicLinkRlMap.set("stale1@x.com", { count: 1, resetAt: Date.now() - 5000 })
      magicLinkRlMap.set("stale2@x.com", { count: 1, resetAt: Date.now() - 5000 })

      checkMagicLinkRateLimit("fresh@x.com")

      expect(magicLinkRlMap.has("stale1@x.com")).toBe(false)
      expect(magicLinkRlMap.has("stale2@x.com")).toBe(false)
    })
  })
})
