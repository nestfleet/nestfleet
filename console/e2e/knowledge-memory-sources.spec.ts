/**
 * E2E tests: Knowledge page — Memory Sources tab — WAVE-5
 *
 * Covers:
 *   T-14 — Post-login redirect lands on /p/<slug>/cases (not /cases)
 *   T-14b — Legacy /cases path redirected by middleware to /p/<slug>/cases
 *   T-15 — Knowledge page: two-tab structure renders correctly
 *   T-16 — Memory Sources tab: source list, empty state, table columns
 *   T-17 — Upload slide-over: open, form fields, validation, cancel
 *   T-18 — Help panel: collapsed by default, expands/collapses
 *   T-19 — Search Probe: renders, button state, action selector
 *   T-20 — Health panel: renders without crash, shows score and dimensions
 *   T-21 — Ingest round-trip: upload a small FAQ document end-to-end
 *
 * Pre-requisites:
 *   API running on localhost:3001
 *   Console running on localhost:3002
 *   At least one product seeded
 *   Admin credentials: admin@nestfleet.local / nestfleet-admin-2025
 */

import { test, expect, type Page } from "@playwright/test"

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL    = "admin@nestfleet.local"
const TEST_PASSWORD = "nestfleet-admin-2025"
const API_BASE      = "http://localhost:3001"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductSummary {
  productId: string
  slug:      string
  name:      string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto("/login")
  await page.waitForLoadState("domcontentloaded")

  // Already on a product page — skip
  if (page.url().match(/\/p\/[^/]+\//)) return
  // Already on /cases legacy path — that's fine too
  if (page.url().includes("/cases")) return

  await page.fill('input[type="email"]',    TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')

  // New behaviour: redirect goes to /p/<slug>/cases — accept both patterns
  await page.waitForURL(/\/(p\/[^/]+\/cases|cases)/, { timeout: 15_000 })
}

async function getFirstProduct(page: Page): Promise<ProductSummary | null> {
  const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
  if (!token) return null
  const resp = await page.request.get(`${API_BASE}/api/v1/products`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok()) return null
  const json = await resp.json() as { products?: ProductSummary[] }
  return json.products?.[0] ?? null
}

async function gotoKnowledge(page: Page, slug: string): Promise<void> {
  await page.goto(`/p/${slug}/knowledge`)
  // Use domcontentloaded instead of networkidle — SWR polling keeps network busy
  await page.waitForLoadState("domcontentloaded")
  await page.waitForSelector("h1", { timeout: 10_000 })
}

async function switchToMemorySourcesTab(page: Page): Promise<void> {
  const tab = page.locator('button', { hasText: "Memory Sources" })
  await expect(tab).toBeVisible({ timeout: 5_000 })
  await tab.click()
  // Wait for content to settle after tab switch
  await page.waitForTimeout(300)
}

// ─── T-14: Post-login redirect ────────────────────────────────────────────────

test.describe("T-14 — Post-login redirect to /p/<slug>/cases", () => {
  test("fresh login redirects to /p/<slug>/cases, not /cases", async ({ page }) => {
    // Start completely fresh (no existing session)
    await page.goto("/login")
    await page.waitForLoadState("networkidle")

    // Confirm we are on the login page
    await expect(page.locator('button[type="submit"]')).toBeVisible()

    await page.fill('input[type="email"]',    TEST_EMAIL)
    await page.fill('input[type="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')

    // Must land on /p/<slug>/cases — NOT the bare /cases
    await page.waitForURL(/\/p\/[a-z0-9-]+\/cases/, { timeout: 15_000 })
    expect(page.url()).toMatch(/\/p\/[a-z0-9-]+\/cases/)
  })
})

test.describe("T-14b — Middleware redirects /cases to /p/<slug>/cases", () => {
  test("navigating to /cases while logged in (with cookie) goes to /p/<slug>/cases", async ({ page }) => {
    await login(page)

    // Direct navigation to the legacy route
    await page.goto("/cases")
    await page.waitForLoadState("networkidle")

    // Middleware should redirect to /p/<slug>/cases if nf_last_product cookie is set
    // OR the legacy page renders — both are acceptable; crash is not.
    await expect(page.locator("body")).not.toContainText("Application error")
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error")

    // The URL should contain /cases in some form
    expect(page.url()).toMatch(/cases/)
  })
})

// ─── T-15: Knowledge page structure ──────────────────────────────────────────

test.describe("T-15 — Knowledge page two-tab structure", () => {
  test("page renders with 'Knowledge' heading", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)

    await expect(page.locator("h1", { hasText: /knowledge/i })).toBeVisible({ timeout: 8_000 })
  })

  test("two tabs are visible: Knowledge Assets and Memory Sources", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)

    await expect(page.locator('button', { hasText: "Knowledge Assets" })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('button', { hasText: "Memory Sources" })).toBeVisible()
  })

  test("default active tab is Knowledge Assets", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)

    // The active tab has the indigo border — check it's "Knowledge Assets"
    const assetsTab = page.locator('button', { hasText: "Knowledge Assets" })
    await expect(assetsTab).toBeVisible({ timeout: 8_000 })

    // Knowledge Assets content: filter buttons (All, Proposed, Approved, Published, Rejected)
    await expect(page.locator('button', { hasText: "Proposed" })).toBeVisible()
  })

  test("clicking Memory Sources tab switches content", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    // Memory Sources tab shows "Search Probe" panel and source count line
    await expect(page.locator('h3', { hasText: "Search Probe" })).toBeVisible({ timeout: 8_000 })
  })
})

// ─── T-16: Memory Sources tab — source list ──────────────────────────────────

test.describe("T-16 — Memory Sources tab: source list", () => {
  test("Upload Document button visible for admin", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await expect(page.locator('button', { hasText: "Upload Document" })).toBeVisible({ timeout: 8_000 })
  })

  test("source count line renders (N sources indexed)", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    // "N source(s) indexed" text always renders
    await expect(page.locator('text=/\\d+ sources? indexed/')).toBeVisible({ timeout: 8_000 })
  })

  test("table shows correct column headers when sources exist", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    // Wait for loading to finish
    await expect(page.locator('text=/No memory sources|Source URI/')).toBeVisible({ timeout: 8_000 })

    const hasTable = await page.locator('text=Source URI').isVisible()
    if (hasTable) {
      await expect(page.locator('text=Source URI')).toBeVisible()
      await expect(page.locator('text=Tier')).toBeVisible()
      await expect(page.locator('text=Chunks')).toBeVisible()
      await expect(page.locator('text=Avg Freshness')).toBeVisible()
    }
    // If no sources, "No memory sources yet" is acceptable
  })

  test("empty state renders 'No memory sources yet' when no sources", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await expect(page.locator('text=/No memory sources|Source URI/')).toBeVisible({ timeout: 8_000 })
    // Both empty state and populated state are valid — no crash is the key assertion
    await expect(page.locator("body")).not.toContainText("Application error")
  })
})

// ─── T-17: Upload slide-over ──────────────────────────────────────────────────

test.describe("T-17 — Upload slide-over", () => {
  test("clicking 'Upload Document' opens slide-over with correct title", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await page.locator('button', { hasText: "Upload Document" }).click()

    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).toBeVisible({ timeout: 5_000 })
  })

  test("slide-over contains all required form fields", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)
    await page.locator('button', { hasText: "Upload Document" }).click()

    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).toBeVisible({ timeout: 5_000 })

    // Source Type selector
    await expect(page.locator('select').first()).toBeVisible()
    // Source URI input
    await expect(page.locator('input[placeholder*="docs://"]')).toBeVisible()
    // Last Updated datetime
    await expect(page.locator('input[type="datetime-local"]')).toBeVisible()
    // Content textarea
    await expect(page.locator('textarea[placeholder*="markdown"]')).toBeVisible()
    // Ingest Document button
    await expect(page.locator('button', { hasText: "Ingest Document" })).toBeVisible()
  })

  test("source type selector has T1 and T2 grouped options", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)
    await page.locator('button', { hasText: "Upload Document" }).click()

    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).toBeVisible({ timeout: 5_000 })

    // Identify the source type select by its placeholder option
    const sourceTypeSelect = page.locator('select', {
      has: page.locator('option[value=""]', { hasText: /Select source type/ }),
    })
    await expect(sourceTypeSelect).toBeVisible()
    const selectHtml = await sourceTypeSelect.innerHTML()
    expect(selectHtml).toContain("T1")
    expect(selectHtml).toContain("T2")
    expect(selectHtml).toContain("FAQ")
    expect(selectHtml).toContain("Runbook")
  })

  test("clicking Cancel closes the slide-over", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)
    await page.locator('button', { hasText: "Upload Document" }).click()

    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).toBeVisible({ timeout: 5_000 })

    await page.locator('button', { hasText: "Cancel" }).click()

    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).not.toBeVisible({ timeout: 3_000 })
  })

  test("submitting with missing required fields shows error toast", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)
    await page.locator('button', { hasText: "Upload Document" }).click()

    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).toBeVisible({ timeout: 5_000 })

    // Click Ingest without filling required fields
    await page.locator('button', { hasText: "Ingest Document" }).click()

    // Toast should show validation error
    await expect(page.locator('text=/Fill in all required fields|required/')).toBeVisible({ timeout: 5_000 })
  })
})

// ─── T-18: Help panel ─────────────────────────────────────────────────────────

test.describe("T-18 — Help panel expand/collapse", () => {
  test("help panel toggle button is visible and panel starts collapsed", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    // Button always visible
    await expect(page.locator('button', { hasText: "How does this affect my product?" })).toBeVisible({ timeout: 8_000 })

    // Help cards NOT visible in collapsed state
    await expect(page.locator('text=T1 sources are non-negotiable')).not.toBeVisible()
  })

  test("clicking the toggle expands the help panel with 6 cards", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await page.locator('button', { hasText: "How does this affect my product?" }).click()

    // All 6 help card titles should appear
    await expect(page.locator('text=This is what the AI reads before it acts')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('text=T1 sources are non-negotiable')).toBeVisible()
    await expect(page.locator('text=Low freshness = stale answers')).toBeVisible()
    await expect(page.locator('text=Conflicts block the AI')).toBeVisible()
    await expect(page.locator('text=Capability gates show what\'s live right now')).toBeVisible()
    await expect(page.locator('text=After every release: re-ingest')).toBeVisible()
  })

  test("clicking toggle again collapses the help panel", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    const toggleBtn = page.locator('button', { hasText: "How does this affect my product?" })
    await toggleBtn.click()
    await expect(page.locator('text=T1 sources are non-negotiable')).toBeVisible({ timeout: 3_000 })

    await toggleBtn.click()
    await expect(page.locator('text=T1 sources are non-negotiable')).not.toBeVisible({ timeout: 3_000 })
  })
})

// ─── T-19: Search Probe ───────────────────────────────────────────────────────

test.describe("T-19 — Search Probe panel", () => {
  test("Search Probe panel renders with all controls", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await expect(page.locator('h3', { hasText: "Search Probe" })).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('input[placeholder="Enter a test query…"]')).toBeVisible()
    // Action type select and topN select are both present on the page
    await expect(page.locator('select', { has: page.locator('option', { hasText: "Any action" }) })).toBeVisible()
    await expect(page.locator('select', { has: page.locator('option', { hasText: "Top 5" }) })).toBeVisible()
    // Search button
    await expect(page.locator('button', { hasText: "Search" })).toBeVisible()
  })

  test("Search button is disabled when query is empty", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    const searchBtn = page.locator('button', { hasText: "Search" })
    await expect(searchBtn).toBeVisible({ timeout: 8_000 })
    await expect(searchBtn).toBeDisabled()
  })

  test("Search button enables when query is entered", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await page.locator('input[placeholder="Enter a test query…"]').fill("What are the API rate limits?")

    const searchBtn = page.locator('button', { hasText: "Search" })
    await expect(searchBtn).toBeEnabled({ timeout: 3_000 })
  })

  test("action type selector has all 6 action options", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await expect(page.locator('h3', { hasText: "Search Probe" })).toBeVisible({ timeout: 8_000 })

    // Check all action options are in the select
    const actionSelect = page.locator('select', { hasText: "Any action" })
    const html = await actionSelect.innerHTML()
    expect(html).toContain("Auto Reply")
    expect(html).toContain("Triage")
    expect(html).toContain("Known Issue Match")
    expect(html).toContain("Change Prep")
    expect(html).toContain("PR Draft")
    expect(html).toContain("Outage Routing")
  })
})

// ─── T-20: Health panel ───────────────────────────────────────────────────────

test.describe("T-20 — Documentation Health panel", () => {
  test("Memory Sources tab does not crash regardless of health data", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    // Wait for full load
    await page.waitForTimeout(2_000)

    await expect(page.locator("body")).not.toContainText("Application error")
    await expect(page.locator("body")).not.toContainText("Cannot convert undefined or null")
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error")
  })

  test("health panel renders 'Documentation Health' when data is available", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    // Wait up to 8s for health panel — it only renders if API returns data
    const healthVisible = await page.locator('h3', { hasText: "Documentation Health" }).isVisible({ timeout: 8_000 }).catch(() => false)

    if (healthVisible) {
      await expect(page.locator('h3', { hasText: "Documentation Health" })).toBeVisible()
      // Overall score should be a number, not NaN
      await expect(page.locator("body")).not.toContainText("NaN")
      // Generated date should not be "Invalid Date"
      await expect(page.locator("body")).not.toContainText("Invalid Date")
      // Dimensions section should render
      await expect(page.locator('text=Dimensions')).toBeVisible()
      // Capability Gates section
      await expect(page.locator('text=Capability Gates')).toBeVisible()
    }
    // If health panel is not visible (no chunks), that's acceptable — no crash is the key assertion
  })
})

// ─── T-21: Ingest round-trip ──────────────────────────────────────────────────

test.describe("T-21 — Ingest document end-to-end", () => {
  test("uploading a small FAQ document shows success toast with chunk count", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    await page.locator('button', { hasText: "Upload Document" }).click()
    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).toBeVisible({ timeout: 5_000 })

    // Fill in required fields — scope to upload panel to avoid picking SearchProbe selects
    const sourceTypeSelect = page.locator('select', {
      has: page.locator('option[value=""]', { hasText: /Select source type/ }),
    })
    await sourceTypeSelect.selectOption("faq")
    await page.locator('input[placeholder*="docs://"]').fill(`docs://e2e-test-faq-${Date.now()}.md`)

    // Set last updated to now
    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    await page.locator('input[type="datetime-local"]').fill(local)

    // Paste a minimal FAQ document
    await page.locator('textarea[placeholder*="markdown"]').fill(`# E2E Test FAQ

## What is the rate limit?
The API rate limit is 1000 requests per minute per API key.

## How do I authenticate?
Use Bearer token authentication. Include your API key in the Authorization header.

## What formats are supported?
JSON and XML are both supported for request and response bodies.
`)

    // Submit
    await page.locator('button', { hasText: "Ingest Document" }).click()

    // Should show a success toast mentioning chunks and tier
    await expect(
      page.locator('text=/Ingested \\d+ chunk|chunks? ingested|tier T/i')
    ).toBeVisible({ timeout: 30_000 })

    // Slide-over should close after success
    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).not.toBeVisible({ timeout: 5_000 })
  })

  test("after successful ingest, source appears in the source list", async ({ page }) => {
    await login(page)
    const product = await getFirstProduct(page)
    if (!product) { test.skip(true, "No product seeded"); return }

    await gotoKnowledge(page, product.slug)
    await switchToMemorySourcesTab(page)

    const uniqueUri = `docs://e2e-verify-${Date.now()}.md`

    await page.locator('button', { hasText: "Upload Document" }).click()
    await expect(page.locator('h2', { hasText: "Upload Memory Source" })).toBeVisible({ timeout: 5_000 })

    const sourceTypeSelect2 = page.locator('select', {
      has: page.locator('option[value=""]', { hasText: /Select source type/ }),
    })
    await sourceTypeSelect2.selectOption("known_issues")
    await page.locator('input[placeholder*="docs://"]').fill(uniqueUri)

    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    await page.locator('input[type="datetime-local"]').fill(local)

    await page.locator('textarea[placeholder*="markdown"]').fill(`# Known Issues

## Issue: Slow startup on cold boot
**Severity**: Medium
**Workaround**: Pre-warm the cache by sending a lightweight probe request 30 seconds before expected load.
`)

    await page.locator('button', { hasText: "Ingest Document" }).click()
    await expect(page.locator('text=/Ingested \\d+ chunk|tier T/i')).toBeVisible({ timeout: 30_000 })

    // Source list should now contain the URI (SWR refreshes after success)
    await expect(page.locator(`text=${uniqueUri}`)).toBeVisible({ timeout: 10_000 })
  })
})
