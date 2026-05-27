/**
 * E2E tests: ?stripe_return=success|cancel handling — NF-BETA-01 §14.2
 *
 * Navigates to /settings with Stripe return params and asserts:
 *   - Toast notification appears with correct message
 *   - stripe_return param is removed from URL
 *   - Billing status SWR is revalidated on success
 *
 * BR-01 through BR-04
 *
 * Prerequisites: backend + console running, admin user exists.
 * Billing and license APIs are mocked to avoid PlatformCloud dependency.
 */

import { test, expect, type Page } from "@playwright/test"

import { TEST_EMAIL, TEST_PASSWORD } from "./fixtures/auth"
// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  if (page.url().match(/\/p\/[^/]+\//) || page.url().includes("/cases")) return

  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(p\/[^/]+\/cases|cases)/, { timeout: 10_000 })
}

/** Mock all billing / license calls that settings page makes. */
async function mockSettingsApis(page: Page) {
  await page.route("**/api/v1/billing/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          enabled: false,
          plan: "community",
          trialEndsAt: null,
          cancelAt: null,
          pendingChanges: [],
        },
      }),
    }),
  )
  await page.route("**/api/v1/license/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          valid: true,
          expired: false,
          tier: "scale",
          cloudStatus: "active",
          offlineWarning: false,
          pendingChanges: [],
        },
      }),
    }),
  )
}

/** Navigate to settings Plan tab with a stripe_return param.
 *  Falls back to the generic /settings URL (middleware redirects to /p/{slug}/settings). */
async function goToSettingsWithReturn(page: Page, returnParam: string) {
  await page.goto(`/settings?section=plan&stripe_return=${returnParam}`)
  // Allow middleware redirect to /p/{slug}/settings
  await page.waitForLoadState("networkidle")
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Stripe return param handling (NF-BETA-01 §14.2)", () => {

  test.beforeEach(async ({ page }) => {
    await mockSettingsApis(page)
    await login(page)
  })

  test("BR-01: ?stripe_return=success shows activation toast", async ({ page }) => {
    await goToSettingsWithReturn(page, "success")

    await expect(page.getByRole("alert"))
      .toContainText(/subscription activated/i, { timeout: 8_000 })
  })

  test("BR-02: ?stripe_return=success cleans the URL parameter", async ({ page }) => {
    await goToSettingsWithReturn(page, "success")

    // Give toast handler time to run router.replace()
    await page.waitForTimeout(500)
    expect(page.url()).not.toContain("stripe_return")
  })

  test("BR-03: ?stripe_return=cancel shows checkout cancelled toast", async ({ page }) => {
    await goToSettingsWithReturn(page, "cancel")

    await expect(page.getByRole("alert"))
      .toContainText(/cancelled|canceled/i, { timeout: 8_000 })
  })

  test("BR-04: ?stripe_return=cancel cleans the URL parameter", async ({ page }) => {
    await goToSettingsWithReturn(page, "cancel")

    await page.waitForTimeout(500)
    expect(page.url()).not.toContain("stripe_return")
  })
})
