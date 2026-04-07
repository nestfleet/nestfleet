/**
 * Unit tests: operator-registry — INFRA-01.
 *
 * Tests the in-memory pub/sub keyed by productId that connects chat/notification
 * producers to open SSE streams.
 *
 * NF-UNIT-OPREG-01  subscribe registers listener and publish fires it
 * NF-UNIT-OPREG-02  unsubscribe removes the listener
 * NF-UNIT-OPREG-03  publish to multiple listeners on same product
 * NF-UNIT-OPREG-04  publish to unknown productId is a no-op
 * NF-UNIT-OPREG-05  hasListeners returns false when no subscribers
 * NF-UNIT-OPREG-06  hasListeners returns true after subscribe
 * NF-UNIT-OPREG-07  hasListeners returns false after last unsubscribe
 * NF-UNIT-OPREG-08  events from one product do not leak to another
 * NF-UNIT-OPREG-09  double-unsubscribe is safe (no throw)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { subscribe, publish, hasListeners } from "../../../src/notifications/operator-registry.js"
import type { OperatorEvent } from "../../../src/notifications/operator-registry.js"

// ── Helpers ──────────────────────────────────────────────────────────────────

function chatEvent(productId: string): OperatorEvent {
  return { type: "chat_message", productId, caseId: "c1", sessionId: "s1", text: "hi", ts: new Date().toISOString() }
}

function uniqueId(): string {
  return `prod-${Math.random().toString(36).slice(2, 10)}`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("operator-registry", () => {
  it("NF-UNIT-OPREG-01: subscribe registers listener; publish fires it with correct event", () => {
    const pid = uniqueId()
    const fn = vi.fn()
    subscribe(pid, fn)

    const evt = chatEvent(pid)
    publish(pid, evt)

    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith(evt)

    // cleanup
    subscribe(pid, fn)() // re-subscribe & unsubscribe to flush
  })

  it("NF-UNIT-OPREG-02: unsubscribe removes the listener so subsequent publish is not received", () => {
    const pid = uniqueId()
    const fn = vi.fn()
    const unsub = subscribe(pid, fn)

    unsub()
    publish(pid, chatEvent(pid))

    expect(fn).not.toHaveBeenCalled()
  })

  it("NF-UNIT-OPREG-03: multiple listeners on the same product all receive the event", () => {
    const pid = uniqueId()
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    const fn3 = vi.fn()

    const u1 = subscribe(pid, fn1)
    const u2 = subscribe(pid, fn2)
    const u3 = subscribe(pid, fn3)

    publish(pid, chatEvent(pid))

    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
    expect(fn3).toHaveBeenCalledOnce()

    u1(); u2(); u3()
  })

  it("NF-UNIT-OPREG-04: publish to an unknown productId is a no-op (no throw)", () => {
    expect(() => publish("no-such-product-xyz", chatEvent("no-such-product-xyz"))).not.toThrow()
  })

  it("NF-UNIT-OPREG-05: hasListeners returns false when no one is subscribed", () => {
    const pid = uniqueId()
    expect(hasListeners(pid)).toBe(false)
  })

  it("NF-UNIT-OPREG-06: hasListeners returns true while a subscriber is active", () => {
    const pid = uniqueId()
    const unsub = subscribe(pid, vi.fn())

    expect(hasListeners(pid)).toBe(true)
    unsub()
  })

  it("NF-UNIT-OPREG-07: hasListeners returns false after the last subscriber unsubscribes", () => {
    const pid = uniqueId()
    const u1 = subscribe(pid, vi.fn())
    const u2 = subscribe(pid, vi.fn())

    expect(hasListeners(pid)).toBe(true)
    u1()
    expect(hasListeners(pid)).toBe(true) // still one left
    u2()
    expect(hasListeners(pid)).toBe(false) // all gone
  })

  it("NF-UNIT-OPREG-08: events published to product A do not reach listeners on product B", () => {
    const pidA = uniqueId()
    const pidB = uniqueId()
    const fnA = vi.fn()
    const fnB = vi.fn()

    const uA = subscribe(pidA, fnA)
    const uB = subscribe(pidB, fnB)

    publish(pidA, chatEvent(pidA))

    expect(fnA).toHaveBeenCalledOnce()
    expect(fnB).not.toHaveBeenCalled()

    uA(); uB()
  })

  it("NF-UNIT-OPREG-09: calling unsubscribe twice does not throw", () => {
    const pid = uniqueId()
    const unsub = subscribe(pid, vi.fn())
    unsub()
    expect(() => unsub()).not.toThrow()
  })
})
