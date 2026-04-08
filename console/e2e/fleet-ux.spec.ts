/**
 * Fleet page UX tests — FLT-01 through FLT-10
 *
 * Covers:
 *   FLT-01  Deprovisioned row shows grey health dot even when last_health_status=ok
 *   FLT-02  Active row with ok health shows green dot
 *   FLT-03  Failed row has red background tint
 *   FLT-04  Provisioning row has amber background tint
 *   FLT-05  Deprovisioned row is visually muted (reduced opacity)
 *   FLT-06  Filter "Active" hides non-active rows
 *   FLT-07  Filter "Failed" shows only failed rows
 *   FLT-08  Filter "All" restores full list
 *   FLT-09  Deprovision dialog title wraps for a long slug (no overflow beyond modal)
 *   FLT-10  Deprovision dialog copy says "immediately" — not "30-day grace period"
 */

import { test, expect, type Page } from "@playwright/test"

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_FLEET = [
  {
    id:                   "prov-active-1",
    org_slug:             "acme-corp",
    customer_email:       "acme@example.com",
    plan:                 "starter",
    status:               "active",
    hetzner_server_ip:    "1.2.3.4",
    provisioned_at:       "2026-04-01T10:00:00Z",
    last_health_status:   "ok",
    last_health_check_at: "2026-04-08T12:00:00Z",
  },
  {
    id:                   "prov-failed-1",
    org_slug:             "broken-co",
    customer_email:       "broken@example.com",
    plan:                 "growth",
    status:               "failed",
    hetzner_server_ip:    "5.6.7.8",
    provisioned_at:       null,
    last_health_status:   null,
    last_health_check_at: null,
  },
  {
    id:                   "prov-provisioning-1",
    org_slug:             "pending-inc",
    customer_email:       "pending@example.com",
    plan:                 "starter",
    status:               "provisioning",
    hetzner_server_ip:    null,
    provisioned_at:       null,
    last_health_status:   null,
    last_health_check_at: null,
  },
  {
    id:                   "prov-deprovisioned-1",
    org_slug:             "old-client",
    customer_email:       "old@example.com",
    plan:                 "starter",
    status:               "deprovisioned",
    hetzner_server_ip:    "9.10.11.12",
    provisioned_at:       "2026-01-01T10:00:00Z",
    last_health_status:   "ok",       // stale — should NOT show green
    last_health_check_at: "2026-03-01T12:00:00Z",
  },
  {
    id:                   "prov-long-slug-1",
    org_slug:             "this-is-a-very-long-customer-slug-name",
    customer_email:       "longslug@example.com",
    plan:                 "scale",
    status:               "active",
    hetzner_server_ip:    "2.3.4.5",
    provisioned_at:       "2026-04-02T10:00:00Z",
    last_health_status:   "ok",
    last_health_check_at: "2026-04-08T12:00:00Z",
  },
]

const FLEET_RESPONSE = { ok: true, data: MOCK_FLEET, total: MOCK_FLEET.length }

// ─── Setup helper ─────────────────────────────────────────────────────────────

async function setupFleetPage(page: Page): Promise<void> {
  // Mock owner/me so the layout's access check passes
  await page.route("**/api/v1/owner/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, isOwner: true, email: "owner@nestfleet.dev" }),
    })
  )

  // Mock fleet list
  await page.route("**/api/v1/owner/fleet**", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FLEET_RESPONSE),
      })
    } else {
      route.continue()
    }
  })

  // Set token in localStorage BEFORE navigating to the protected page.
  // Go to /login first (no auth guard), set storage, then navigate.
  await page.goto("/login")
  await page.evaluate(() => {
    localStorage.setItem("nestfleet_token", "mock-owner-token")
  })
  await page.goto("/owner/fleet")
  await page.waitForSelector("table", { timeout: 10_000 })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Fleet page UX", () => {

  test("FLT-01: deprovisioned row shows grey health dot despite stale ok status", async ({ page }) => {
    await setupFleetPage(page)

    // Find the deprovisioned row by slug
    const row = page.locator("tr", { hasText: "old-client" })
    const dot = row.locator('[aria-label^="Health"]')
    await expect(dot).toHaveAttribute("aria-label", "Health unknown")
    await expect(dot).not.toHaveClass(/bg-emerald/)
  })

  test("FLT-02: active row with ok health shows green dot", async ({ page }) => {
    await setupFleetPage(page)

    const row = page.locator("tr", { hasText: "acme-corp" })
    const dot = row.locator('[aria-label^="Health"]')
    await expect(dot).toHaveAttribute("aria-label", "Health: ok")
    await expect(dot).toHaveClass(/bg-emerald/)
  })

  test("FLT-03: failed row has red background tint", async ({ page }) => {
    await setupFleetPage(page)

    const row = page.locator("tr", { hasText: "broken-co" })
    await expect(row).toHaveClass(/bg-red/)
  })

  test("FLT-04: provisioning row has amber background tint", async ({ page }) => {
    await setupFleetPage(page)

    const row = page.locator("tr", { hasText: "pending-inc" })
    await expect(row).toHaveClass(/bg-amber/)
  })

  test("FLT-05: deprovisioned row is visually muted (opacity class)", async ({ page }) => {
    await setupFleetPage(page)

    const row = page.locator("tr", { hasText: "old-client" })
    await expect(row).toHaveClass(/opacity/)
  })

  test("FLT-06: filter Active hides non-active rows", async ({ page }) => {
    await setupFleetPage(page)

    await page.getByRole("button", { name: "Active" }).click()

    await expect(page.locator("tr", { hasText: "acme-corp" })).toBeVisible()
    await expect(page.locator("tr", { hasText: "broken-co" })).not.toBeVisible()
    await expect(page.locator("tr", { hasText: "pending-inc" })).not.toBeVisible()
    await expect(page.locator("tr", { hasText: "old-client" })).not.toBeVisible()
  })

  test("FLT-07: filter Failed shows only failed rows", async ({ page }) => {
    await setupFleetPage(page)

    await page.getByRole("button", { name: "Failed" }).click()

    await expect(page.locator("tr", { hasText: "broken-co" })).toBeVisible()
    await expect(page.locator("tr", { hasText: "acme-corp" })).not.toBeVisible()
    await expect(page.locator("tr", { hasText: "old-client" })).not.toBeVisible()
  })

  test("FLT-08: filter All restores full list", async ({ page }) => {
    await setupFleetPage(page)

    await page.getByRole("button", { name: "Failed" }).click()
    await page.getByRole("button", { name: "All" }).click()

    await expect(page.locator("tr", { hasText: "acme-corp" })).toBeVisible()
    await expect(page.locator("tr", { hasText: "broken-co" })).toBeVisible()
    await expect(page.locator("tr", { hasText: "old-client" })).toBeVisible()
  })

  test("FLT-09: deprovision dialog title does not overflow modal bounds for a long slug", async ({ page }) => {
    await setupFleetPage(page)

    // Open deprovision dialog for the long-slug row
    const row = page.locator("tr", { hasText: "this-is-a-very-long-customer-slug-name" })
    await row.getByRole("button", { name: /Deprovision/i }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    const title = dialog.locator("h2")
    const dialogBox = await dialog.boundingBox()
    const titleBox  = await title.boundingBox()

    expect(dialogBox).not.toBeNull()
    expect(titleBox).not.toBeNull()

    // Title must not extend beyond right edge of dialog
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(
      dialogBox!.x + dialogBox!.width + 1   // 1px tolerance for rounding
    )
  })

  test("FLT-10: deprovision dialog copy describes immediate deletion, not 30-day grace", async ({ page }) => {
    await setupFleetPage(page)

    const row = page.locator("tr", { hasText: "acme-corp" })
    await row.getByRole("button", { name: /Deprovision/i }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    const text = await dialog.textContent()
    expect(text).toMatch(/immediate/i)
    expect(text).not.toMatch(/30.day grace/i)
  })
})
