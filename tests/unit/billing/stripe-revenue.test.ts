/**
 * Unit tests: stripe-revenue aggregation — NF-OPS-01 Phase 1.
 *
 * NF-UNIT-REV-01  MRR sums active subscription amounts
 * NF-UNIT-REV-02  trialing subscriptions are included in MRR
 * NF-UNIT-REV-03  canceled/past_due subscriptions excluded from MRR
 * NF-UNIT-REV-04  ARR equals MRR × 12
 * NF-UNIT-REV-05  churn count is subscriptions canceled within last 30 days only
 * NF-UNIT-REV-06  weekly series groups new subscriptions by ISO week (last 12 weeks)
 * NF-UNIT-REV-07  empty subscription list returns all-zero result
 * NF-UNIT-REV-08  buildCohorts returns weekly trial start counts
 */

import { describe, it, expect } from "vitest"
import { aggregateRevenue, buildCohorts } from "../../../src/billing/stripe-revenue.js"
import type { RevenueData, CohortWeek } from "../../../src/billing/stripe-revenue.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEEK_SECS = 7 * 24 * 60 * 60

/**
 * Return the Unix timestamp (seconds) for the START of the Unix week that is
 * `n` weeks before the current week.  Using week-start anchors guarantees that
 * adding small offsets (e.g. +3600, +86400) stays within the same bucket,
 * regardless of what day of the week today is.
 */
function weeksAgo(n: number): number {
  const currentWeek = Math.floor(Date.now() / 1000 / WEEK_SECS)
  return (currentWeek - n) * WEEK_SECS
}

function daysAgo(n: number): number {
  return Math.floor((Date.now() - n * 24 * 60 * 60 * 1000) / 1000)
}

/** Minimal Stripe subscription shape used by aggregateRevenue */
function makeSub(overrides: {
  id?:         string
  status?:     string
  unitAmount?: number   // cents
  interval?:  "month" | "year"
  startDate?:  number
  canceledAt?: number | null
  trialEnd?:   number | null
}) {
  return {
    id:     overrides.id     ?? "sub_test",
    status: overrides.status ?? "active",
    items:  {
      data: [{
        price: {
          unit_amount:        overrides.unitAmount ?? 2900,
          recurring:          { interval: overrides.interval ?? "month" },
        },
      }],
    },
    start_date: overrides.startDate ?? daysAgo(60),
    canceled_at: overrides.canceledAt ?? null,
    trial_end:   overrides.trialEnd   ?? null,
  }
}

// ── aggregateRevenue ──────────────────────────────────────────────────────────

describe("aggregateRevenue", () => {
  it("NF-UNIT-REV-01: MRR sums active subscription amounts", async () => {
    const subs = [
      makeSub({ id: "sub_1", status: "active", unitAmount: 2900 }),
      makeSub({ id: "sub_2", status: "active", unitAmount: 4900 }),
    ]

    const result = await aggregateRevenue(subs)

    // MRR in cents: 2900 + 4900 = 7800
    expect(result.mrrCents).toBe(7800)
  })

  it("NF-UNIT-REV-02: trialing subscriptions are included in MRR", async () => {
    const subs = [
      makeSub({ id: "sub_1", status: "active",   unitAmount: 2900 }),
      makeSub({ id: "sub_2", status: "trialing", unitAmount: 2900, trialEnd: daysAgo(-7) }),
    ]

    const result = await aggregateRevenue(subs)

    expect(result.mrrCents).toBe(5800)
    expect(result.trialCount).toBe(1)
  })

  it("NF-UNIT-REV-03: canceled and past_due subscriptions excluded from MRR", async () => {
    const subs = [
      makeSub({ id: "sub_1", status: "active",    unitAmount: 2900 }),
      makeSub({ id: "sub_2", status: "canceled",  unitAmount: 2900, canceledAt: daysAgo(5) }),
      makeSub({ id: "sub_3", status: "past_due",  unitAmount: 2900 }),
      makeSub({ id: "sub_4", status: "incomplete", unitAmount: 2900 }),
    ]

    const result = await aggregateRevenue(subs)

    expect(result.mrrCents).toBe(2900)
    expect(result.paidCount).toBe(1)
  })

  it("NF-UNIT-REV-04: ARR equals MRR × 12", async () => {
    const subs = [
      makeSub({ id: "sub_1", status: "active", unitAmount: 2900 }),
    ]

    const result = await aggregateRevenue(subs)

    expect(result.arrCents).toBe(result.mrrCents * 12)
  })

  it("NF-UNIT-REV-05: churn count is subscriptions canceled in last 30 days only", async () => {
    const subs = [
      // Canceled 10 days ago — within 30d window
      makeSub({ id: "sub_1", status: "canceled", canceledAt: daysAgo(10) }),
      // Canceled 45 days ago — outside window
      makeSub({ id: "sub_2", status: "canceled", canceledAt: daysAgo(45) }),
      // Canceled today
      makeSub({ id: "sub_3", status: "canceled", canceledAt: daysAgo(0) }),
      // Active — not churned
      makeSub({ id: "sub_4", status: "active" }),
    ]

    const result = await aggregateRevenue(subs)

    expect(result.churn30d).toBe(2) // sub_1 + sub_3
  })

  it("NF-UNIT-REV-06: weekly series covers last 12 weeks with new sub counts", async () => {
    const subs = [
      // Started 2 weeks ago
      makeSub({ id: "sub_1", status: "active", startDate: weeksAgo(2) }),
      // Started 2 weeks ago (same week)
      makeSub({ id: "sub_2", status: "active", startDate: weeksAgo(2) + 86400 }),
      // Started 8 weeks ago
      makeSub({ id: "sub_3", status: "active", startDate: weeksAgo(8) }),
      // Started 15 weeks ago — outside 12-week window
      makeSub({ id: "sub_4", status: "active", startDate: weeksAgo(15) }),
    ]

    const result = await aggregateRevenue(subs)

    expect(result.weeklySeries).toHaveLength(12)

    // Two subs in the week 2 weeks ago
    const week2 = result.weeklySeries.find((w) => w.newSubs === 2)
    expect(week2).toBeDefined()

    // One sub in the week 8 weeks ago
    const week8 = result.weeklySeries.find((w) => w.weekLabel !== week2?.weekLabel && w.newSubs === 1)
    expect(week8).toBeDefined()

    // Sub from 15 weeks ago not counted
    const total = result.weeklySeries.reduce((s, w) => s + w.newSubs, 0)
    expect(total).toBe(3)
  })

  it("NF-UNIT-REV-07: empty subscription list returns all-zero result", async () => {
    const result = await aggregateRevenue([])

    expect(result.mrrCents).toBe(0)
    expect(result.arrCents).toBe(0)
    expect(result.paidCount).toBe(0)
    expect(result.trialCount).toBe(0)
    expect(result.churn30d).toBe(0)
    expect(result.weeklySeries).toHaveLength(12)
    result.weeklySeries.forEach((w) => expect(w.newSubs).toBe(0))
  })
})

// ── buildCohorts ──────────────────────────────────────────────────────────────

describe("buildCohorts", () => {
  it("NF-UNIT-REV-08: buildCohorts returns weekly trial start counts", async () => {
    const subs = [
      // Two trials started 1 week ago
      makeSub({ id: "sub_1", status: "trialing", startDate: weeksAgo(1),        trialEnd: daysAgo(-7) }),
      makeSub({ id: "sub_2", status: "trialing", startDate: weeksAgo(1) + 3600, trialEnd: daysAgo(-7) }),
      // One trial started 3 weeks ago, now converted (active, but had trial)
      makeSub({ id: "sub_3", status: "active",   startDate: weeksAgo(3), trialEnd: daysAgo(1) }),
    ]

    const cohorts: CohortWeek[] = await buildCohorts(subs)

    expect(Array.isArray(cohorts)).toBe(true)
    expect(cohorts.length).toBeGreaterThan(0)

    // Week with 2 trials
    const weekWith2 = cohorts.find((c) => c.trialStarts === 2)
    expect(weekWith2).toBeDefined()

    // Week with converted trial
    const weekWith1 = cohorts.find((c) => c.weekLabel !== weekWith2?.weekLabel && c.trialStarts >= 1)
    expect(weekWith1).toBeDefined()
  })
})
