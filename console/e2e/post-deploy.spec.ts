/**
 * Post-deploy smoke tests — run against the live VPS after every deploy.
 *
 * These tests make REAL API calls (no page.route() mocks) to validate:
 *   PD-01  Console HTML renders (browser loads the app)
 *   PD-02  Unauthenticated route redirects to /login (auth guard works)
 *   PD-03  Auth flow: real login → JWT returned + stored (DB read + JWT issuance)
 *   PD-04  /api/v1/auth/me returns profile (proves DB CRUD: write at registration,
 *          read at login + /me — no mocks, full stack)
 *
 * Requires env vars (GitHub secrets in CI):
 *   BASE_URL        — e.g. https://nestfleet.dev  (set in playwright.config.ts)
 *   CANARY_EMAIL    — pre-created test account email
 *   CANARY_PASSWORD — pre-created test account password
 *
 * PD-03 and PD-04 are skipped automatically when canary creds are absent.
 */

import { test, expect } from "@playwright/test"

const CANARY_EMAIL    = process.env.CANARY_EMAIL    ?? ""
const CANARY_PASSWORD = process.env.CANARY_PASSWORD ?? ""
const hasCreds = Boolean(CANARY_EMAIL && CANARY_PASSWORD)

// ── PD-01: Console HTML loads ─────────────────────────────────────────────────

test("PD-01: console homepage returns HTML (app shell rendered)", async ({ page }) => {
  const res = await page.goto("/")
  expect(res?.status()).toBeLessThan(500)
  // Either the app or a redirect — what must NOT happen is a blank/error page
  const title = await page.title()
  expect(title).toBeTruthy()
})

// ── PD-02: Auth guard redirects unauthenticated users ────────────────────────

test("PD-02: visiting a protected route unauthenticated redirects to /login", async ({ page }) => {
  // /settings is a genuinely protected app route: middleware passes it through
  // (no nf_last_product cookie in a fresh browser, needsSetup=false on the live
  // instance), then the client-side useAuth guard in <AppLayout> redirects an
  // unauthenticated visitor to /login. We do NOT use "/" here — with
  // NEXT_PUBLIC_SHOW_LANDING=true the deployed build serves the public marketing
  // landing page at "/", so it never redirects and would not exercise the guard.
  await page.goto("/settings")
  // The auth guard fires client-side after localStorage rehydration; wait for
  // the redirect to /login rather than just network idle.
  await page.waitForURL(/\/login/, { timeout: 10_000 })
  expect(page.url()).toMatch(/\/login/)
})

// ── PD-03: Real login flow — browser UI ──────────────────────────────────────

test("PD-03: canary login via UI stores JWT and leaves /login", async ({ page }) => {
  test.skip(!hasCreds, "CANARY_EMAIL / CANARY_PASSWORD not set — skipping")

  await page.goto("/login")
  await page.waitForLoadState("networkidle")

  await page.fill("#email",    CANARY_EMAIL)
  await page.fill("#password", CANARY_PASSWORD)
  await page.click('button[type="submit"]')

  // Should navigate away from /login within 10 s
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })

  // JWT must be persisted in localStorage
  const token = await page.evaluate(() => localStorage.getItem("nestfleet_token"))
  expect(token).toBeTruthy()
  // Sanity: looks like a JWT (three dot-separated segments)
  expect((token ?? "").split(".")).toHaveLength(3)
})

// ── PD-04: /auth/me — full DB read via API request context ───────────────────

test("PD-04: POST /auth/login then GET /auth/me returns user profile", async ({ request }) => {
  test.skip(!hasCreds, "CANARY_EMAIL / CANARY_PASSWORD not set — skipping")

  // Real login — hits Postgres, issues JWT
  const loginRes = await request.post("/api/v1/auth/login", {
    data: { email: CANARY_EMAIL, password: CANARY_PASSWORD },
  })
  expect(loginRes.status()).toBe(200)

  const loginBody = await loginRes.json() as { token: string }
  const token = loginBody.token
  expect(token).toBeTruthy()

  // Authenticated DB read — proves CRUD round-trip works
  const meRes = await request.get("/api/v1/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(meRes.status()).toBe(200)

  const meBody = await meRes.json() as { email: string }
  expect(meBody.email).toBe(CANARY_EMAIL)
})
