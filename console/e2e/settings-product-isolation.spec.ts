/**
 * E2E tests: Settings page — per-product LLM config isolation.
 *
 * Covers the bug where ProductProvider did not reset product state when the
 * slug prop changed, causing LlmSection (and other sections) to stay mounted
 * with the previous product's local state during the async re-fetch window.
 *
 * Fix: `key={slug}` on <ProductProvider> in (app)/p/[slug]/layout.tsx forces
 *       a full remount on slug change.
 *
 * Covers:
 *   T-20 — Each product's settings page loads its own LLM model name
 *   T-21 — A→B switch: settings reflects Product B data, not Product A's
 *   T-22 — A→B→A round-trip: back to Product A shows Product A data again
 *   T-23 — API key hint (****) present/absent correctly per product
 *   T-24 — Save LLM settings sends request to the correct product's endpoint
 *
 * Pre-requisites:
 *   API running on localhost:3001
 *   Console running on localhost:3002
 *   Two products seeded: DocuGardener (google/gemini-flash-latest, valid key)
 *                        SkillSeal    (google/gemini-3-flash-preview, "admin" key)
 *   Admin credentials: admin@nestfleet.local / nestfleet-admin-2025
 */

import { test, expect, type Page } from "@playwright/test"

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL    = "admin@nestfleet.local"
const TEST_PASSWORD = "nestfleet-admin-2025"
const API_BASE      = "http://localhost:3001"

// Slugs match the seeded products. Tests skip gracefully when not found.
const SLUG_A = "docugardener"  // valid encrypted key, model: gemini-flash-latest
const SLUG_B = "skillseal"     // "admin" key (< 8 chars, no hint), model: gemini-3-flash-preview

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  if (page.url().includes("/cases") || page.url().match(/\/p\/[^/]+\//)) return

  await page.fill('input[type="email"]',    TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL("**/cases", { timeout: 15_000 })
}

/** Navigate to a product's settings page and wait for the LLM section to appear. */
async function gotoSettings(page: Page, slug: string): Promise<void> {
  await page.goto(`/p/${slug}/settings`)
  await page.waitForLoadState("networkidle")
  // Wait for the "LLM Provider" section heading — confirms settings have loaded
  await expect(page.locator("text=LLM Provider").first()).toBeVisible({ timeout: 10_000 })
}

/** Check whether both slugs resolve to real products via the API. */
async function hasBothProducts(page: Page): Promise<boolean> {
  const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
  if (!token) return false
  const resp = await page.request.get(`${API_BASE}/api/v1/products`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok()) return false
  const json = await resp.json() as { products?: Array<{ slug: string }> }
  const slugs = (json.products ?? []).map((p) => p.slug)
  return slugs.includes(SLUG_A) && slugs.includes(SLUG_B)
}

/**
 * Read the value of the Chat Model control (select or text input).
 * Returns the trimmed string, or "" if the control is not visible.
 */
async function readModelValue(page: Page): Promise<string> {
  const modelSelect = page.locator('select').filter({ has: page.locator('option') }).first()
  const modelInput  = page.locator('label:has-text("Chat Model") + div input, label:has-text("Chat Model") ~ input').first()

  if (await modelSelect.isVisible().catch(() => false)) {
    return (await modelSelect.inputValue()).trim()
  }
  if (await modelInput.isVisible().catch(() => false)) {
    return (await modelInput.inputValue()).trim()
  }
  // Fallback: find any input near the Chat Model label
  const near = page.locator('text=Chat Model').locator("..").locator("input, select").first()
  if (await near.isVisible().catch(() => false)) {
    return (await near.inputValue()).trim()
  }
  return ""
}

// ─── T-20: Each product loads its own LLM model ──────────────────────────────

test.describe("T-20 — Settings LLM section shows correct model per product", () => {
  test("DocuGardener settings shows gemini-flash-latest", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-20 requires docugardener + skillseal products")
      return
    }

    await gotoSettings(page, SLUG_A)

    // Connection message includes the configured model name
    await expect(page.locator(`text=gemini-flash-latest`).first())
      .toBeVisible({ timeout: 8_000 })
  })

  test("SkillSeal settings shows gemini-3-flash-preview", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-20 requires docugardener + skillseal products")
      return
    }

    await gotoSettings(page, SLUG_B)

    await expect(page.locator(`text=gemini-3-flash-preview`).first())
      .toBeVisible({ timeout: 8_000 })
  })
})

// ─── T-21: A→B switch shows Product B data ───────────────────────────────────

test.describe("T-21 — Switching A→B loads Product B LLM data", () => {
  test("after switching to SkillSeal, model is gemini-3-flash-preview (not gemini-flash-latest)", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-21 requires docugardener + skillseal products")
      return
    }

    // Start on DocuGardener settings
    await gotoSettings(page, SLUG_A)
    await expect(page.locator("text=gemini-flash-latest").first()).toBeVisible({ timeout: 8_000 })

    // Switch to SkillSeal
    await gotoSettings(page, SLUG_B)

    // Must show SkillSeal's model — NOT DocuGardener's stale value
    await expect(page.locator("text=gemini-3-flash-preview").first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator("text=gemini-flash-latest")).not.toBeVisible()
  })
})

// ─── T-22: A→B→A round-trip restores Product A data ─────────────────────────

test.describe("T-22 — A→B→A round-trip: Product A data restored on return", () => {
  test("model reverts to gemini-flash-latest after switching back to DocuGardener", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-22 requires docugardener + skillseal products")
      return
    }

    // Step 1: DocuGardener settings — note model
    await gotoSettings(page, SLUG_A)
    await expect(page.locator("text=gemini-flash-latest").first()).toBeVisible({ timeout: 8_000 })

    // Step 2: Switch to SkillSeal
    await gotoSettings(page, SLUG_B)
    await expect(page.locator("text=gemini-3-flash-preview").first()).toBeVisible({ timeout: 8_000 })

    // Step 3: Switch back to DocuGardener
    await gotoSettings(page, SLUG_A)

    // Must show DocuGardener's model — ProductProvider remount ensures no stale state
    await expect(page.locator("text=gemini-flash-latest").first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator("text=gemini-3-flash-preview")).not.toBeVisible()
  })

  test("URL is /p/docugardener/settings after round-trip", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-22 requires docugardener + skillseal products")
      return
    }

    await gotoSettings(page, SLUG_A)
    await gotoSettings(page, SLUG_B)
    await gotoSettings(page, SLUG_A)

    expect(page.url()).toContain(`/p/${SLUG_A}/settings`)
  })
})

// ─── T-23: API key hint (****) correct per product ───────────────────────────

test.describe("T-23 — API key hint visible/hidden per product", () => {
  test("DocuGardener shows saved-key hint (****) because key > 8 chars", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-23 requires docugardener + skillseal products")
      return
    }

    await gotoSettings(page, SLUG_A)

    // The API key label shows (****xxxx) when apiKeyLast4 is set
    await expect(page.locator("text=/\\(\\*{4}/").first()).toBeVisible({ timeout: 8_000 })
  })

  test("SkillSeal does NOT show saved-key hint because 'admin' is < 8 chars (maskApiKey returns null)", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-23 requires docugardener + skillseal products")
      return
    }

    await gotoSettings(page, SLUG_B)

    // No (****) hint — key too short to mask
    await expect(page.locator("text=/\\(\\*{4}/")).not.toBeVisible()

    // The password input placeholder says "Paste your API key" (no saved key)
    await expect(page.locator('input[type="password"]').first())
      .toHaveAttribute("placeholder", /paste your api key/i, { timeout: 8_000 })
  })

  test("after A→B→A, DocuGardener hint still shows (****)", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-23 requires docugardener + skillseal products")
      return
    }

    await gotoSettings(page, SLUG_A)
    await gotoSettings(page, SLUG_B)
    await gotoSettings(page, SLUG_A)

    // After round-trip, hint must still be present — not wiped by SkillSeal's null state
    await expect(page.locator("text=/\\(\\*{4}/").first()).toBeVisible({ timeout: 8_000 })
  })
})

// ─── T-24: Save request targets the correct product endpoint ─────────────────

test.describe("T-24 — LLM save request uses the current product's ID", () => {
  test("saving settings on SkillSeal sends PUT to SkillSeal's product endpoint, not DocuGardener's", async ({ page }) => {
    await login(page)
    if (!(await hasBothProducts(page))) {
      test.skip(true, "T-24 requires docugardener + skillseal products")
      return
    }

    // Get both product IDs from the API
    const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
    const resp  = await page.request.get(`${API_BASE}/api/v1/products`, {
      headers: { Authorization: `Bearer ${token!}` },
    })
    const { products } = await resp.json() as { products: Array<{ slug: string; productId: string }> }
    const skillseal = products.find((p) => p.slug === SLUG_B)
    const docugardener = products.find((p) => p.slug === SLUG_A)

    if (!skillseal || !docugardener) {
      test.skip(true, "T-24 requires both products in DB")
      return
    }

    // Navigate to DocuGardener first (so there's a "previous" product in history)
    await gotoSettings(page, SLUG_A)
    await expect(page.locator("text=LLM Provider").first()).toBeVisible({ timeout: 8_000 })

    // Then switch to SkillSeal
    await gotoSettings(page, SLUG_B)
    await expect(page.locator("text=LLM Provider").first()).toBeVisible({ timeout: 8_000 })

    // Intercept the next PUT /settings request
    const putRequests: string[] = []
    await page.route(`${API_BASE}/api/v1/products/*/settings`, (route) => {
      putRequests.push(route.request().url())
      void route.continue()
    })

    // Click Save on SkillSeal's settings (provider + model already filled from state)
    const saveBtn = page.locator("button", { hasText: /save/i }).first()
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 })
    await saveBtn.click()

    // Wait for the intercepted request
    await page.waitForTimeout(2_000)

    // The PUT must target SkillSeal's productId — NOT DocuGardener's
    expect(putRequests.length).toBeGreaterThan(0)
    const sentToSkillSeal    = putRequests.some((url) => url.includes(skillseal.productId))
    const sentToDocuGardener = putRequests.some((url) => url.includes(docugardener.productId))

    expect(sentToSkillSeal,    "PUT must target SkillSeal's product ID").toBe(true)
    expect(sentToDocuGardener, "PUT must NOT target DocuGardener's product ID").toBe(false)
  })
})
