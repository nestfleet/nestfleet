/**
 * E2E tests: /register page (customer VPS first-time account creation)
 *
 * All API calls are intercepted via page.route() — deterministic, no real backend needed.
 * Mirrors the pattern used in signup.spec.ts.
 *
 * REG-01 through REG-10
 */

import { test, expect, type Page } from "@playwright/test"

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mockRegisterApi(page: Page, response: { status: number; body: unknown }) {
  await page.route("**/api/v1/auth/register", (route) =>
    route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    }),
  )
}

async function mockSetupStatus(page: Page) {
  await page.route("**/api/v1/setup/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { needsSetup: false } }),
    }),
  )
}

const HAPPY_RESPONSE = {
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

test.describe("/register page", () => {

  // ── Rendering ────────────────────────────────────────────────────────────────

  test("REG-01: page renders with email, password, and submit button", async ({ page }) => {
    await page.goto("/register")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("#email")).toBeVisible()
    await expect(page.locator("#password")).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test("REG-02: optional displayName field is present", async ({ page }) => {
    await page.goto("/register")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("#displayName")).toBeVisible()
  })

  test("REG-03: 'Sign in' link navigates to /login", async ({ page }) => {
    await page.goto("/register")
    await page.waitForLoadState("networkidle")

    const signInLink = page.locator('a[href="/login"]')
    await expect(signInLink).toBeVisible()
  })

  // ── Login page link ──────────────────────────────────────────────────────────

  test("REG-04: /login page shows 'Create your account' link to /register", async ({ page }) => {
    // Mock auth/me so the login page doesn't redirect an authenticated user
    await page.route("**/api/v1/auth/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "UNAUTHORIZED" }) }),
    )

    await page.goto("/login")
    await page.waitForLoadState("networkidle")

    const registerLink = page.locator('a[href="/register"]')
    await expect(registerLink).toBeVisible()
  })

  // ── Validation ───────────────────────────────────────────────────────────────

  test("REG-05: submit button disabled when email or password is empty", async ({ page }) => {
    await page.goto("/register")
    await page.waitForLoadState("networkidle")

    const submit = page.locator('button[type="submit"]')
    await expect(submit).toBeDisabled()

    // Fill only email — still disabled
    await page.fill("#email", "alice@example.com")
    await expect(submit).toBeDisabled()

    // Fill password too — now enabled
    await page.fill("#password", "SecurePass123")
    await expect(submit).toBeEnabled()
  })

  // ── API error states ─────────────────────────────────────────────────────────

  test("REG-06: REGISTRATION_ENABLED=false → 404 shows 'not enabled' message", async ({ page }) => {
    await mockRegisterApi(page, {
      status: 404,
      body: { error: "REGISTRATION_DISABLED", message: "Public registration is not enabled." },
    })

    await page.goto("/register")
    await page.fill("#email", "alice@example.com")
    await page.fill("#password", "SecurePass123")
    await page.click('button[type="submit"]')

    await expect(page.locator("body")).toContainText(/not enabled|disabled|administrator/i)
    expect(page.url()).toContain("/register")
  })

  test("REG-07: duplicate email → 409 shows 'already exists' message", async ({ page }) => {
    await mockRegisterApi(page, {
      status: 409,
      body: { error: "CONFLICT", message: "An account with this email already exists." },
    })

    await page.goto("/register")
    await page.fill("#email", "existing@example.com")
    await page.fill("#password", "SecurePass123")
    await page.click('button[type="submit"]')

    await expect(page.locator("body")).toContainText(/already exists|sign in/i)
    expect(page.url()).toContain("/register")
  })

  // ── Happy path ───────────────────────────────────────────────────────────────

  test("REG-08: happy path — stores token in localStorage and redirects to /setup", async ({ page }) => {
    // Catch-all registered FIRST (lowest LIFO priority) — specific mocks registered after take precedence
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: {} }) }),
    )
    await mockSetupStatus(page)
    await mockRegisterApi(page, { status: 201, body: HAPPY_RESPONSE })

    await page.goto("/register")
    await page.fill("#email", "alice@example.com")
    await page.fill("#password", "SecurePass123")
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/setup/, { timeout: 8_000 })
    const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
    expect(token).toBe("mock.jwt.token")
  })

  test("REG-09: happy path with displayName — still redirects to /setup", async ({ page }) => {
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: {} }) }),
    )
    await mockSetupStatus(page)
    await mockRegisterApi(page, { status: 201, body: HAPPY_RESPONSE })

    await page.goto("/register")
    await page.fill("#displayName", "Alice Smith")
    await page.fill("#email", "alice@example.com")
    await page.fill("#password", "SecurePass123")
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/setup/, { timeout: 8_000 })
    const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
    expect(token).toBe("mock.jwt.token")
  })

  test("REG-10: response never contains password_hash in page content", async ({ page }) => {
    await page.route("**/api/v1/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: {} }) }),
    )
    await mockSetupStatus(page)
    await mockRegisterApi(page, {
      status: 201,
      body: {
        ok: true,
        data: {
          token: "mock.jwt.token",
          // Simulate a bug where backend leaks password_hash — page must not show it
          user: { userId: "usr_01", email: "a@b.com", roles: ["admin"], productIds: [], password_hash: "$2b$12$secret" },
        },
      },
    })

    await page.goto("/register")
    await page.fill("#email", "a@b.com")
    await page.fill("#password", "SecurePass123")
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/setup/, { timeout: 8_000 })
    const content = await page.content()
    expect(content).not.toContain("$2b$")
    expect(content).not.toContain("password_hash")
  })
})
