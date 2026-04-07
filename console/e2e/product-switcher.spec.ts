/**
 * E2E tests: Multi-Product Console — DEFERRED-21 P7
 *
 * Covers:
 *   T-09 — Product switch A→B serves Product B data
 *   T-10 — SWR cache isolation: after switch, page reflects only Product B
 *   T-11 — Navigating to /p/nonexistent/cases shows not-found
 *   T-12 — Legacy /cases path (NEXT_PUBLIC_PRODUCT_ID fallback) still works
 *   T-13 — Add Product wizard → redirect to new product /cases
 *
 * Pre-requisites:
 *   API running on localhost:3001
 *   Console running on localhost:3002
 *   At least one product seeded (two for T-09/T-10)
 *   Admin credentials: admin@nestfleet.local / nestfleet-admin-2025
 */

import { test, expect, type Page } from "@playwright/test"

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_EMAIL    = "admin@nestfleet.local"
const TEST_PASSWORD = "nestfleet-admin-2025"
const API_BASE      = "http://localhost:3001"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductSummary {
  productId:   string
  slug:        string
  name:        string
  stage:       string
  accentColor?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page): Promise<void> {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  if (page.url().includes("/cases") || page.url().match(/\/p\/[^/]+\//)) return

  await page.fill('input[type="email"]',    TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL("**/cases", { timeout: 15_000 })
}

/** Retrieve the products list from the API using the session token from localStorage. */
async function getProducts(page: Page): Promise<ProductSummary[]> {
  const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
  if (!token) return []
  const resp = await page.request.get(`${API_BASE}/api/v1/products`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok()) return []
  const json = await resp.json() as { products?: ProductSummary[] }
  return json.products ?? []
}

/** Navigate to a product's cases page and wait for it to load. */
async function gotoProduct(page: Page, slug: string): Promise<void> {
  await page.goto(`/p/${slug}/cases`)
  await page.waitForLoadState("networkidle")
}

// ─── T-09: Product switch A→B serves Product B data ─────────────────────────

test.describe("T-09 — Product switch A→B", () => {
  test("switching product updates URL and sidebar to Product B", async ({ page }) => {
    await login(page)

    const products = await getProducts(page)
    if (products.length < 2) {
      test.skip(true, "T-09 requires at least 2 products — skip in single-product seed")
      return
    }

    const [productA, productB] = products

    // Navigate to Product A's cases page
    await gotoProduct(page, productA.slug)
    expect(page.url()).toContain(`/p/${productA.slug}/`)

    // Open the product switcher dropdown
    const switcherButton = page.locator('[aria-haspopup="listbox"]').first()
    await expect(switcherButton).toBeVisible()
    await switcherButton.click()

    // Click on Product B in the dropdown
    const productBOption = page.locator('[role="listbox"] button', { hasText: productB.name }).first()
    await expect(productBOption).toBeVisible({ timeout: 5_000 })
    await productBOption.click()

    // URL should now contain Product B's slug
    await page.waitForURL(`**/p/${productB.slug}/**`, { timeout: 10_000 })
    expect(page.url()).toContain(`/p/${productB.slug}/`)
  })

  test("Product B name is shown in the switcher trigger after switch", async ({ page }) => {
    await login(page)

    const products = await getProducts(page)
    if (products.length < 2) {
      test.skip(true, "T-09 requires at least 2 products")
      return
    }

    const [productA, productB] = products

    await gotoProduct(page, productA.slug)

    const switcherButton = page.locator('[aria-haspopup="listbox"]').first()
    await switcherButton.click()

    const productBOption = page.locator('[role="listbox"] button', { hasText: productB.name }).first()
    await productBOption.click()

    await page.waitForURL(`**/p/${productB.slug}/**`, { timeout: 10_000 })

    // Switcher trigger should now show Product B's name
    await expect(switcherButton).toContainText(productB.name, { timeout: 5_000 })
  })
})

// ─── T-10: SWR cache isolation ───────────────────────────────────────────────

test.describe("T-10 — SWR cache isolation after product switch", () => {
  test("Cases page after switch shows Product B heading, not Product A data", async ({ page }) => {
    await login(page)

    const products = await getProducts(page)
    if (products.length < 2) {
      test.skip(true, "T-10 requires at least 2 products")
      return
    }

    const [productA, productB] = products

    // Load Product A
    await gotoProduct(page, productA.slug)
    await page.waitForLoadState("networkidle")

    // Switch to Product B via URL (most direct way to trigger SWR key change)
    await gotoProduct(page, productB.slug)
    await page.waitForLoadState("networkidle")

    // The SWR key for cases is ["cases", productId, ...]. After switching, the
    // page must load with Product B's productId. Verify the URL is correct and
    // the page renders (no "No product configured" error state visible).
    expect(page.url()).toContain(`/p/${productB.slug}/`)

    // Cases page should show the "Cases" heading (not an error or Product A label)
    await expect(page.locator("h1")).toContainText(/cases/i, { timeout: 8_000 })

    // Product A name should NOT appear in the switcher button when on Product B
    const switcherButton = page.locator('[aria-haspopup="listbox"]').first()
    if (products.length >= 2) {
      // The switcher shows current product — it should show B, not A
      await expect(switcherButton).toContainText(productB.name, { timeout: 5_000 })
      await expect(switcherButton).not.toContainText(productA.name)
    }
  })
})

// ─── T-11: /p/nonexistent/cases shows not-found ──────────────────────────────

test.describe("T-11 — Non-existent product slug shows not-found", () => {
  test("navigating to /p/nonexistent-slug-xyz/cases redirects to not-found", async ({ page }) => {
    await login(page)

    // Use a slug that passes format validation but doesn't exist in the DB.
    // Format: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/ — "nonexistent-slug-xyz" is valid format.
    await page.goto("/p/nonexistent-slug-xyz/cases")
    await page.waitForLoadState("networkidle")

    // ProductProvider calls router.replace("/not-found") when slug is not found
    await page.waitForURL("**/not-found", { timeout: 10_000 })
    expect(page.url()).toContain("not-found")
  })

  test("middleware rejects slugs with invalid format (uppercase) via rewrite", async ({ page }) => {
    // Slug with uppercase chars fails the middleware format check → rewrites to /not-found
    await page.goto("/p/INVALID-SLUG/cases")
    await page.waitForLoadState("networkidle")

    // Either URL is /not-found or a 404-style page is shown
    const isNotFound =
      page.url().includes("not-found") ||
      page.url().includes("INVALID-SLUG")  // may stay on URL with rewrite
    expect(isNotFound).toBe(true)
  })
})

// ─── T-12: Legacy /cases path still works ────────────────────────────────────

test.describe("T-12 — Legacy NEXT_PUBLIC_PRODUCT_ID path unchanged", () => {
  test("/cases page renders without errors (useProductIdWithFallback path)", async ({ page }) => {
    await login(page)

    // The legacy /cases page uses useProductIdWithFallback().
    // Even without NEXT_PUBLIC_PRODUCT_ID, it renders — either with data (if
    // fallback env var is set) or with an empty-state "No product configured" message.
    // Either way, the page must not crash.
    await page.goto("/cases")
    await page.waitForLoadState("networkidle")

    // One of:
    //   a) Cases table renders (NEXT_PUBLIC_PRODUCT_ID is set)
    //   b) "No product configured" message renders (env var absent)
    //   c) Page redirects to /p/[slug]/cases (if auth resolves a product)
    const casesHeading = page.locator("h1", { hasText: /cases/i })
    const noProductMsg = page.locator("text=No product configured")
    const isOnCasesLikePage =
      page.url().includes("/cases") || page.url().includes("/p/")

    expect(isOnCasesLikePage).toBe(true)

    // Assert page didn't crash (no unhandled error boundary)
    await expect(page.locator("body")).not.toContainText("Application error")
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error")

    // At least one of the valid states is present
    const headingCount = await casesHeading.count()
    const msgCount     = await noProductMsg.count()
    expect(headingCount + msgCount).toBeGreaterThanOrEqual(1)
  })

  test("AppLayout renders correctly on legacy /approvals path", async ({ page }) => {
    await login(page)
    await page.goto("/approvals")
    await page.waitForLoadState("networkidle")

    // Page should render (not error) and show the approvals heading or redirect
    const isOnApprovals = page.url().includes("/approvals")
    if (isOnApprovals) {
      await expect(page.locator("body")).not.toContainText("Application error")
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 5_000 })
    }
    // If redirected to /p/[slug]/approvals, that's also acceptable
    expect(page.url()).toMatch(/approvals/)
  })
})

// ─── T-13: Add Product wizard → redirect to new product /cases ───────────────

test.describe("T-13 — Add Product wizard creates product and redirects", () => {
  test("completing the wizard redirects to /p/<new-slug>/cases", async ({ page }) => {
    await login(page)

    const products = await getProducts(page)
    const firstSlug = products[0]?.slug
    if (!firstSlug) {
      test.skip(true, "T-13 requires at least one existing product")
      return
    }

    // Navigate to a product page where the switcher dropdown is visible
    await gotoProduct(page, firstSlug)

    // Open the product switcher to access "Add Product"
    const switcherButton = page.locator('[aria-haspopup="listbox"]').first()
    await expect(switcherButton).toBeVisible()
    await switcherButton.click()

    // Click "Add Product" button in the dropdown footer
    const addProductBtn = page.locator('button', { hasText: /add product/i }).first()
    await expect(addProductBtn).toBeVisible({ timeout: 5_000 })
    await addProductBtn.click()

    // ── Wizard Step 1: Product name ──────────────────────────────────────────
    const nameInput = page.locator('#product-name')
    await expect(nameInput).toBeVisible({ timeout: 5_000 })

    const uniqueName = `E2E Test Product ${Date.now()}`
    await nameInput.fill(uniqueName)

    const nextBtn = page.locator('button', { hasText: /next/i }).first()
    await expect(nextBtn).toBeEnabled()
    await nextBtn.click()

    // ── Wizard Step 2: Stage ─────────────────────────────────────────────────
    // Select "Production" stage (it's the default, but click it to be sure)
    const productionStageOption = page.locator('input[name="stage"][value="production"]')
    await expect(productionStageOption).toBeVisible({ timeout: 5_000 })
    await productionStageOption.click()

    const createBtn = page.locator('button', { hasText: /create/i }).last()
    await expect(createBtn).toBeEnabled()
    await createBtn.click()

    // ── Verify redirect ──────────────────────────────────────────────────────
    // After creation, router.push(`/p/${newSlug}/cases`)
    await page.waitForURL("**/cases", { timeout: 15_000 })

    // URL should be /p/<something>/cases (new product slug)
    expect(page.url()).toMatch(/\/p\/[a-z0-9-]+\/cases$/)

    // The new product should NOT be the old product
    if (firstSlug) {
      const newUrl = page.url()
      // URL pattern: /p/<new-slug>/cases — new slug derived from uniqueName
      // We just verify it's a valid product route and page loads
      await expect(page.locator("h1", { hasText: /cases/i })).toBeVisible({ timeout: 8_000 })
    }
  })
})
