/**
 * E2E regression tests for:
 *
 * BEF-17 — Reopen action on Resolved cases
 *   "Reopen Case" button must appear in the lineage timeline when case status is resolved.
 *
 * BEF-16 — Follow-up email on resolved cases
 *   "Send Follow-up" button must appear in the lineage timeline when case status is resolved.
 *
 * BEF-20 — Cross-product lineage links
 *   When the lineage response contains crossProductLinks, an amber panel listing
 *   related cases from other products must be rendered on the case detail page.
 *
 * Strategy: all API calls are intercepted so no live backend is required.
 *
 * Pre-requisites:
 *   Console → http://localhost:3002
 *
 * Run: npx playwright test e2e/bef-17-16-20.spec.ts
 */

import { test, expect, type Page } from "@playwright/test"

import { TEST_EMAIL, TEST_PASSWORD } from "./fixtures/auth"
// ─── Credentials & constants ──────────────────────────────────────────────────

const CASE_ID       = "case-bef-test"

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  if (page.url().includes("/cases") || page.url().match(/\/p\/[^/]+\//)) return
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(p\/[^/]+\/cases|cases)/, { timeout: 10_000 })
}

function makeLineageResponse(options: {
  caseStatus?: string
  crossProductLinks?: { productId: string; caseId: string; title: string | null; status: string; createdAt: string }[]
} = {}) {
  const { caseStatus = "resolved", crossProductLinks = [] } = options
  return {
    data: {
      caseId: CASE_ID,
      productId: "test-product-id",
      currentStatus: caseStatus,
      nodes: [
        {
          nodeId: "node-1",
          type: "resolved",
          title: "Resolved",
          summary: "Case was resolved",
          occurredAt: new Date().toISOString(),
          actorType: "human",
          actorRef: "operator@example.com",
          action: "case.resolved",
          agentRun: null,
          metadata: {},
          availableActions: caseStatus === "resolved" ? ["reopen", "send_followup", "escalate"] : [],
        },
      ],
      edges: [],
      signal: null,
      changeRequests: [],
      crossProductLinks,
    },
  }
}

/** Intercept the cases list + lineage endpoint, then navigate to the case detail page. */
async function navigateToCaseDetail(
  page: Page,
  lineageResponse: ReturnType<typeof makeLineageResponse>,
) {
  // Mock cases list
  await page.route(
    (url) => url.port === "3001" && url.pathname.includes("/cases") && !url.pathname.includes("/lineage") && !url.pathname.includes("/conversation"),
    (route) => {
      if (route.request().method() !== "GET") { route.continue(); return }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{
            caseId: CASE_ID,
            title: "BEF test case",
            status: lineageResponse.data.currentStatus,
            severity: "medium",
            type: "bug",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            last_event_action: "case.resolved",
          }],
          total: 1, page: 1, pageSize: 50,
        }),
      })
    },
  )

  // Mock single case detail
  await page.route(
    (url) => url.port === "3001" && url.pathname.includes(`/cases/${CASE_ID}`) && !url.pathname.includes("/lineage") && !url.pathname.includes("/conversation"),
    (route) => {
      if (route.request().method() !== "GET") { route.continue(); return }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            caseId: CASE_ID,
            title: "BEF test case",
            status: lineageResponse.data.currentStatus,
            severity: "medium",
            type: "bug",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      })
    },
  )

  // Mock conversation (empty)
  await page.route(
    (url) => url.port === "3001" && url.pathname.includes("/conversation"),
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }),
  )

  // Mock lineage
  await page.route(
    (url) => url.port === "3001" && url.pathname.includes("/lineage"),
    (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(lineageResponse),
    }),
  )

  await page.goto(`/cases/${CASE_ID}`)
  await page.waitForLoadState("networkidle")
}

// ─── BEF-17 + BEF-16: Reopen and Follow-up buttons ───────────────────────────

test.describe("BEF-17 — Reopen Case button on resolved case", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("BEF-17.1 — Reopen Case button is visible when case status is resolved", async ({ page }) => {
    await navigateToCaseDetail(page, makeLineageResponse({ caseStatus: "resolved" }))

    const reopenBtn = page.getByRole("button", { name: /reopen case/i })
    await expect(reopenBtn).toBeVisible({ timeout: 8_000 })
  })

  test("BEF-17.2 — Reopen Case button is absent when case status is awaiting-lead", async ({ page }) => {
    await navigateToCaseDetail(page, makeLineageResponse({ caseStatus: "awaiting-lead" }))

    const reopenBtn = page.getByRole("button", { name: /reopen case/i })
    await expect(reopenBtn).not.toBeVisible({ timeout: 5_000 })
  })

  test("BEF-17.3 — clicking Reopen Case calls the reopen API endpoint", async ({ page }) => {
    let reopenCalled = false
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("/reopen"),
      (route) => {
        reopenCalled = true
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { caseId: CASE_ID, status: "awaiting-lead" } }) })
      },
    )

    await navigateToCaseDetail(page, makeLineageResponse({ caseStatus: "resolved" }))

    const reopenBtn = page.getByRole("button", { name: /reopen case/i })
    await expect(reopenBtn).toBeVisible({ timeout: 8_000 })
    await reopenBtn.click()

    await page.waitForTimeout(1_000)
    expect(reopenCalled).toBe(true)
  })
})

test.describe("BEF-16 — Send Follow-up button on resolved case", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("BEF-16.1 — Send Follow-up button is visible when case status is resolved", async ({ page }) => {
    await navigateToCaseDetail(page, makeLineageResponse({ caseStatus: "resolved" }))

    const followUpBtn = page.getByRole("button", { name: /send follow.up/i })
    await expect(followUpBtn).toBeVisible({ timeout: 8_000 })
  })

  test("BEF-16.2 — Send Follow-up button is absent when case status is awaiting-lead", async ({ page }) => {
    await navigateToCaseDetail(page, makeLineageResponse({ caseStatus: "awaiting-lead" }))

    const followUpBtn = page.getByRole("button", { name: /send follow.up/i })
    await expect(followUpBtn).not.toBeVisible({ timeout: 5_000 })
  })
})

// ─── BEF-20: Cross-product identity links panel ───────────────────────────────

test.describe("BEF-20 — Cross-product lineage links panel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("BEF-20.1 — cross-product panel is visible when crossProductLinks is non-empty", async ({ page }) => {
    const response = makeLineageResponse({
      crossProductLinks: [
        {
          productId: "other-product-id",
          caseId:    "case-other-001",
          title:     "Payment gateway timeout — OtherProduct",
          status:    "resolved",
          createdAt: new Date().toISOString(),
        },
      ],
    })

    await navigateToCaseDetail(page, response)

    // The amber panel heading
    await expect(page.getByText(/same reporter in other products/i)).toBeVisible({ timeout: 8_000 })
    // The related case title
    await expect(page.getByText(/payment gateway timeout/i)).toBeVisible({ timeout: 5_000 })
  })

  test("BEF-20.2 — cross-product panel is absent when crossProductLinks is empty", async ({ page }) => {
    await navigateToCaseDetail(page, makeLineageResponse({ crossProductLinks: [] }))

    await expect(page.getByText(/same reporter in other products/i)).not.toBeVisible({ timeout: 5_000 })
  })

  test("BEF-20.3 — cross-product panel shows status badge for related case", async ({ page }) => {
    const response = makeLineageResponse({
      crossProductLinks: [
        {
          productId: "other-product-id",
          caseId:    "case-other-002",
          title:     "Login error after deploy",
          status:    "awaiting-lead",
          createdAt: new Date().toISOString(),
        },
      ],
    })

    await navigateToCaseDetail(page, response)

    await expect(page.getByText(/awaiting-lead/i)).toBeVisible({ timeout: 8_000 })
  })
})
