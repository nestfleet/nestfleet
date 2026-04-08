/**
 * Plan & Billing section UX tests — PLN-01 through PLN-06
 *
 * Covers the upgrade options filtering logic in LicenseSection:
 *
 *   PLN-01  Community tier → Starter + Growth cards both shown
 *   PLN-02  Starter tier   → only Growth card shown (not Starter)
 *   PLN-03  Growth tier    → no upgrade cards (section hidden)
 *   PLN-04  Scale tier     → no upgrade cards (section hidden)
 *   PLN-05  Starter tier   → "Upgrade to Starter" button absent
 *   PLN-06  Manage subscription section shown when billing plan is active
 */

import { test, expect, type Page } from "@playwright/test"

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const PRODUCT_ID = "prod_test123"

async function setupSettingsPage(
  page: Page,
  tier: "community" | "starter" | "growth" | "scale",
  billingPlan: string | null = null,
): Promise<void> {
  // Catch-all for any API calls we don't explicitly mock
  await page.route("**/api/v1/**", (route) => {
    // Default: 200 empty response
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: null }) })
  })

  // Auth — admin user so the "plan" section (adminOnly: true) is visible
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        userId:     "user_test",
        email:      "admin@test.com",
        roles:      ["admin"],
        productIds: [PRODUCT_ID],
      }),
    })
  )

  // License status — reflects the JWT tier
  await page.route("**/api/v1/license/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          tier,
          features:     [],
          valid:        true,
          expired:      false,
          statusMessage: "License valid",
          productLimit: 3,
          currentProducts: 1,
          expiresAt:    null,
          ouUsage:      null,
        },
      }),
    })
  )

  // Billing status — null unless explicitly set (BILLING_ENABLED=false on customer VPS)
  await page.route("**/api/v1/billing/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: billingPlan
          ? { plan: billingPlan, planInterval: "monthly", cancelAt: null, trialEndsAt: null }
          : null,
      }),
    })
  )

  // Settings — minimal response so the page renders
  await page.route(`**/api/v1/products/${PRODUCT_ID}/settings`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          llm: { provider: "anthropic", model: "claude-sonnet-4-6", apiKeyLast4: "****1234", apiKeyConfigured: true },
          leads: {},
          github: {},
          accentColor: null,
        },
      }),
    })
  )

  // Setup status — needsSetup: false so middleware doesn't redirect
  await page.route("**/api/v1/setup/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { needsSetup: false } }),
    })
  )

  // Auth token in localStorage before navigation
  await page.goto("/login")
  await page.evaluate((productId) => {
    localStorage.setItem("nestfleet_token", "mock-token")
    localStorage.setItem("nestfleet_product_id", productId)
  }, PRODUCT_ID)

  // Navigate directly to settings plan section
  await page.goto(`/settings?section=plan`)
  // Wait for the Plan & Billing heading to appear
  await page.waitForSelector("text=Plan & Billing", { timeout: 10_000 })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Plan & Billing upgrade options", () => {

  test("PLN-01: community tier shows both Starter and Growth upgrade cards", async ({ page }) => {
    await setupSettingsPage(page, "community")

    await expect(page.getByRole("button", { name: /Upgrade to Starter/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Upgrade to Growth/i })).toBeVisible()
  })

  test("PLN-02: starter tier shows only Growth upgrade card", async ({ page }) => {
    await setupSettingsPage(page, "starter")

    await expect(page.getByRole("button", { name: /Upgrade to Growth/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Upgrade to Starter/i })).not.toBeVisible()
  })

  test("PLN-03: growth tier shows no upgrade cards", async ({ page }) => {
    await setupSettingsPage(page, "growth")

    await expect(page.getByRole("button", { name: /Upgrade to/i })).not.toBeVisible()
  })

  test("PLN-04: scale tier shows no upgrade cards", async ({ page }) => {
    await setupSettingsPage(page, "scale")

    await expect(page.getByRole("button", { name: /Upgrade to/i })).not.toBeVisible()
  })

  test("PLN-05: starter tier — 'Upgrade to Starter' button is absent", async ({ page }) => {
    await setupSettingsPage(page, "starter")

    const upgradeButtons = page.getByRole("button", { name: /Upgrade to/i })
    const count = await upgradeButtons.count()
    expect(count).toBe(1)  // only Growth
    await expect(upgradeButtons.first()).toContainText("Growth")
  })

  test("PLN-06: manage subscription section shown when billing plan is active", async ({ page }) => {
    await setupSettingsPage(page, "starter", "starter")  // billing active

    // Manage subscription section should be visible for paid billing plans
    await expect(page.getByText("Manage subscription")).toBeVisible()
    // Upgrade cards should be hidden (billing says starter, upgrade section filtered)
    await expect(page.getByRole("button", { name: /Upgrade to Starter/i })).not.toBeVisible()
  })
})
