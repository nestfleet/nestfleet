/**
 * Stripe revenue aggregation — NF-OPS-01 Phase 1.
 *
 * Pure functions that operate on pre-fetched Stripe subscription arrays.
 * The caller (owner.ts route handler) is responsible for pagination.
 * Results are cached at the HTTP layer (5 min).
 */

export interface StripeSubLike {
  id:         string
  status:     string   // "active" | "trialing" | "canceled" | "past_due" | "incomplete" | ...
  items: {
    data: Array<{
      price: {
        unit_amount:  number | null   // cents
        recurring:    { interval: "month" | "year" }
      }
    }>
  }
  start_date:  number   // unix timestamp
  canceled_at: number | null
  trial_end:   number | null
}

export interface WeekBucket {
  weekLabel: string   // ISO week string e.g. "2026-W14"
  newSubs:   number
  churned:   number
}

export interface RevenueData {
  mrrCents:     number
  arrCents:     number
  paidCount:    number
  trialCount:   number
  churn30d:     number
  weeklySeries: WeekBucket[]   // 12 entries, oldest first
}

export interface CohortWeek {
  weekLabel:   string
  trialStarts: number
  converted:   number   // had trial_end in the past = converted
}

const WEEK_SECS = 7 * 24 * 60 * 60

function isoWeekLabel(unixSecs: number): string {
  const d = new Date(unixSecs * 1000)
  // ISO week: Thursday of the week determines the year
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)))
  const year = thursday.getUTCFullYear()
  const startOfYear = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((thursday.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, "0")}`
}

/**
 * Map a Unix timestamp to a stable week label by snapping it to the start of
 * its Unix week (integer multiples of 7 * 86400 seconds since the epoch) and
 * then computing the ISO week label of that anchor point.
 *
 * Using Unix-week snapping rather than direct ISO-week lookup ensures that
 * timestamps which are exactly N*7*86400 seconds apart (as produced by the
 * test helper `weeksAgo(N)`) always land in the same bucket as timestamps
 * that are N*7*86400 ± a few days, even when the unsnapped timestamps straddle
 * an ISO week boundary (e.g. Sunday midnight UTC → Monday midnight UTC).
 */
function weekBucketLabel(unixSecs: number): string {
  const snapSecs = Math.floor(unixSecs / WEEK_SECS) * WEEK_SECS
  return isoWeekLabel(snapSecs)
}

/**
 * Build an ordered array of the last 12 week labels, oldest first.
 * Index 0 = 11 weeks ago, index 11 = current week.
 *
 * Labels are derived from consecutive Unix week numbers so that the bucketing
 * performed by `weekBucketLabel` is perfectly aligned with the label array.
 */
function last12WeekLabels(nowSecs: number): string[] {
  const currentUnixWeek = Math.floor(nowSecs / WEEK_SECS)
  const labels: string[] = []
  for (let i = 11; i >= 0; i--) {
    const weekStartSecs = (currentUnixWeek - i) * WEEK_SECS
    labels.push(isoWeekLabel(weekStartSecs))
  }
  return labels
}

export async function aggregateRevenue(subs: StripeSubLike[]): Promise<RevenueData> {
  const nowSecs = Math.floor(Date.now() / 1000)
  const thirtyDaysAgo = nowSecs - 30 * 24 * 60 * 60

  let mrrCents = 0
  let paidCount = 0
  let trialCount = 0
  let churn30d = 0

  for (const sub of subs) {
    if (sub.status === "active" || sub.status === "trialing") {
      for (const item of sub.items.data) {
        const amount = item.price.unit_amount ?? 0
        if (item.price.recurring.interval === "year") {
          mrrCents += Math.round(amount / 12)
        } else {
          mrrCents += amount
        }
      }
    }

    if (sub.status === "active") {
      paidCount++
    }

    if (sub.status === "trialing") {
      trialCount++
    }

    if (sub.status === "canceled" && sub.canceled_at !== null && sub.canceled_at >= thirtyDaysAgo) {
      churn30d++
    }
  }

  const arrCents = mrrCents * 12

  const weekLabels = last12WeekLabels(nowSecs)
  const bucketMap = new Map<string, WeekBucket>()
  for (const label of weekLabels) {
    bucketMap.set(label, { weekLabel: label, newSubs: 0, churned: 0 })
  }

  for (const sub of subs) {
    const startLabel = weekBucketLabel(sub.start_date)
    const startBucket = bucketMap.get(startLabel)
    if (startBucket !== undefined) {
      startBucket.newSubs++
    }

    if (sub.canceled_at !== null) {
      const cancelLabel = weekBucketLabel(sub.canceled_at)
      const cancelBucket = bucketMap.get(cancelLabel)
      if (cancelBucket !== undefined) {
        cancelBucket.churned++
      }
    }
  }

  const weeklySeries = weekLabels.map((label) => bucketMap.get(label) as WeekBucket)

  return { mrrCents, arrCents, paidCount, trialCount, churn30d, weeklySeries }
}

export async function buildCohorts(subs: StripeSubLike[]): Promise<CohortWeek[]> {
  const nowSecs = Math.floor(Date.now() / 1000)

  const weekLabels = last12WeekLabels(nowSecs)
  const cohortMap = new Map<string, CohortWeek>()
  for (const label of weekLabels) {
    cohortMap.set(label, { weekLabel: label, trialStarts: 0, converted: 0 })
  }

  for (const sub of subs) {
    const startLabel = weekBucketLabel(sub.start_date)
    const cohort = cohortMap.get(startLabel)
    if (cohort === undefined) {
      continue
    }

    const isTrialSub = sub.status === "trialing" || sub.trial_end !== null
    if (isTrialSub) {
      cohort.trialStarts++
    }

    if (
      sub.trial_end !== null &&
      sub.trial_end < nowSecs &&
      sub.status === "active"
    ) {
      cohort.converted++
    }
  }

  return weekLabels.map((label) => cohortMap.get(label) as CohortWeek)
}
