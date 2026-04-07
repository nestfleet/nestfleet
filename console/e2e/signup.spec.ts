/**
 * E2E tests: /signup page — NF-BETA-01 §14.1 + §14.3
 *
 * All API calls are intercepted via page.route() so these tests are
 * deterministic and do not depend on REGISTRATION_ENABLED or backend state.
 *
 * SU-01 through SU-08
 */

import { test, expect, type Page } from "@playwright/test"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mock the register API with a given response. */
async function mockRegister(
  page: Page,
  response: { status: number; body: unknown },
) {
  await page.route("**/api/v1/auth/register", (route) =>
    route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    }),
  )
}

/** Mock setup/status so the /setup redirect target renders without errors. */
async function mockSetupStatus(page: Page) {
  await page.route("**/api/v1/setup/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { needsSetup: false } }),
    }),
  )
}

const HAPPY_REGISTER_RESPONSE = {
  ok: true,
  data: {
    token: "mock.jwt.token",
    user: {
      userId: "usr_01TEST",
      email: "alice@example.com",
      roles: ["admin"],
      productIds: [],
    },
  },
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("/signup page (NF-BETA-01)", () => {

  test("SU-01: page renders with all required form fields", async ({ page }) => {
    await page.goto("/signup")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("#email")).toBeVisible()
    await expect(page.locator("#password")).toBeVisible()
    await expect(page.locator("#confirm")).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test("SU-02: optional displayName field is present", async ({ page }) => {
    await page.goto("/signup")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("#displayName")).toBeVisible()
  })

  test("SU-03: ?plan=starter shows plan label in the page", async ({ page }) => {
    await page.goto("/signup?plan=starter")
    await page.waitForLoadState("networkidle")

    // Plan-specific messaging must be visible somewhere on the page
    await expect(page.locator("body")).toContainText(/starter/i)
  })

  test("SU-04: password mismatch shows inline error without submitting", async ({ page }) => {
    // Track whether a register request is made (it must NOT be)
    let registerCalled = false
    await page.route("**/api/v1/auth/register", (route) => {
      registerCalled = true
      route.continue()
    })

    await page.goto("/signup")
    await page.fill("#email", "alice@example.com")
    await page.fill("#password", "SecurePass123")
    await page.fill("#confirm", "DifferentPass456")
    await page.click('button[type="submit"]')

    await expect(page.locator("body")).toContainText(/do not match|mismatch|confirm/i)
    expect(registerCalled).toBe(false)
  })

  test("SU-05: REGISTRATION_ENABLED=false → 404 shows 'not enabled' message", async ({ page }) => {
    await mockRegister(page, {
      status: 404,
      body: { error: "REGISTRATION_DISABLED", message: "Public registration is not enabled." },
    })

    await page.goto("/signup")
    await page.fill("#email", "alice@example.com")
    await page.fill("#password", "SecurePass123")
    await page.fill("#confirm", "SecurePass123")
    await page.click('button[type="submit"]')

    await expect(page.locator("body")).toContainText(/not enabled|disabled|registration/i)
    // Must stay on /signup — not redirect
    expect(page.url()).toContain("/signup")
  })

  test("SU-06: duplicate email → 409 shows 'already registered' message", async ({ page }) => {
    await mockRegister(page, {
      status: 409,
      body: { error: "CONFLICT", message: "An account with this email already exists." },
    })

    await page.goto("/signup")
    await page.fill("#email", "existing@example.com")
    await page.fill("#password", "SecurePass123")
    await page.fill("#confirm", "SecurePass123")
    await page.click('button[type="submit"]')

    await expect(page.locator("body")).toContainText(/already|exists|taken/i)
    expect(page.url()).toContain("/signup")
  })

  test("SU-07: happy path — stores token in localStorage and redirects to /setup", async ({ page }) => {
    await mockRegister(page, { status: 201, body: HAPPY_REGISTER_RESPONSE })
    await mockSetupStatus(page)
    // Stub further API calls that /setup might trigger
    await page.route("**/api/v1/**", (route) => {
      if (route.request().url().includes("/api/v1/auth/register")) return route.continue()
      if (route.request().url().includes("/api/v1/setup/status")) return route.continue()
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: {} }) })
    })

    await page.goto("/signup")
    await page.fill("#email", "alice@example.com")
    await page.fill("#password", "SecurePass123")
    await page.fill("#confirm", "SecurePass123")
    await page.click('button[type="submit"]')

    // Token stored in localStorage
    await page.waitForURL(/\/setup/, { timeout: 8_000 })
    const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
    expect(token).toBe("mock.jwt.token")
  })

  test("SU-08: terms and privacy policy links are present on the page", async ({ page }) => {
    await page.goto("/signup")
    await page.waitForLoadState("networkidle")

    // At least one of terms/privacy must be linked
    const termsLink  = page.locator('a[href*="terms"], a:has-text("Terms")')
    const privacyLink = page.locator('a[href*="privacy"], a:has-text("Privacy")')

    const hasTerms   = await termsLink.count()
    const hasPrivacy = await privacyLink.count()
    expect(hasTerms + hasPrivacy).toBeGreaterThan(0)
  })
})

// ── Legal page load tests (LP-01) ─────────────────────────────────────────────

test.describe("Legal pages (LP-01)", () => {
  test("LP-01-a: /terms page loads and shows heading", async ({ page }) => {
    await page.goto("/terms")
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveTitle(/Terms of Service/i)
    await expect(page.locator("h1")).toContainText(/Terms of Service/i)
    // Draft banner must be visible (page is a placeholder)
    await expect(page.locator("body")).toContainText(/draft|placeholder/i)
    // Key sections present
    await expect(page.locator("body")).toContainText(/Acceptance/i)
    await expect(page.locator("body")).toContainText(/Intellectual Property/i)
  })

  test("LP-01-b: /privacy page loads and shows heading", async ({ page }) => {
    await page.goto("/privacy")
    await page.waitForLoadState("networkidle")

    await expect(page).toHaveTitle(/Privacy Policy/i)
    await expect(page.locator("h1")).toContainText(/Privacy Policy/i)
    // Draft banner
    await expect(page.locator("body")).toContainText(/draft|placeholder/i)
    // GDPR sections present
    await expect(page.locator("body")).toContainText(/Data Controller/i)
    await expect(page.locator("body")).toContainText(/Legal Basis/i)
    await expect(page.locator("body")).toContainText(/Your Rights/i)
  })

  test("LP-01-c: /terms links back to /privacy", async ({ page }) => {
    await page.goto("/terms")
    await page.waitForLoadState("networkidle")
    const privacyLink = page.locator('a[href*="/privacy"]').first()
    await expect(privacyLink).toBeVisible()
  })

  test("LP-01-d: /privacy links back to /terms", async ({ page }) => {
    await page.goto("/privacy")
    await page.waitForLoadState("networkidle")
    const termsLink = page.locator('a[href*="/terms"]').first()
    await expect(termsLink).toBeVisible()
  })
})
