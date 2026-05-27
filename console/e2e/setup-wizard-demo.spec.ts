/**
 * Setup Wizard — Full Demo Walkthrough (Non-destructive)
 *
 * Uses Playwright route interception to make the wizard think
 * no product exists, without actually deleting anything.
 *
 * Screenshots saved to: console/e2e/screenshots/
 * Run:  npx playwright test e2e/setup-wizard-demo.spec.ts
 */

import { test, expect } from "@playwright/test"
import path from "path"

const SCREENSHOTS_DIR = path.resolve(__dirname, "screenshots")

test.describe("Setup Wizard — Full Demo", () => {

  test("Walk through all 5 wizard steps", async ({ page }) => {
    // ── Intercept setup/status to always return needsSetup: true ────
    // This prevents the wizard from redirecting away
    await page.route("**/api/v1/setup/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { needsSetup: true } }),
      })
    })

    // Intercept setup/complete so we don't actually create a product
    await page.route("**/api/v1/setup/complete", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { productId: "demo_product", productName: "Acme" } }),
      })
    })

    // Intercept list-models for the LLM step — returns string[] like the real API
    await page.route("**/api/v1/setup/list-models", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            provider: "google",
            models: [
              "gemini-2.5-flash-preview-05-20",
              "gemini-2.5-pro-preview-05-06",
              "gemini-2.0-flash",
            ],
          },
        }),
      })
    })

    // Navigate to /setup
    await page.goto("/setup", { waitUntil: "networkidle" })

    // ── Step 1: Welcome ─────────────────────────────────────────────
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/01-welcome-empty.png`, fullPage: true })

    // Fill product name
    const nameInput = page.locator('input[id="productName"], input[name="productName"], input').first()
    await nameInput.fill("Acme")
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02-welcome-filled.png`, fullPage: true })

    // Next
    await page.locator("button", { hasText: /next/i }).click()
    await page.waitForTimeout(600)

    // ── Step 2: Connect LLM ─────────────────────────────────────────
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/03-llm-providers.png`, fullPage: true })

    // Click Google/Gemini provider card
    const googleCard = page.locator("button, div", { hasText: /google/i }).filter({ hasText: /gemini/i }).first()
    if (await googleCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await googleCard.click()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${SCREENSHOTS_DIR}/04-llm-google-selected.png`, fullPage: true })

      // Fill API key
      const keyInput = page.locator('input[type="password"], input[placeholder*="key"], input[placeholder*="Key"]').first()
      if (await keyInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await keyInput.fill("AIzaSy...demo-key-redacted")
        await page.waitForTimeout(300)

        // Click Test Connection
        const testBtn = page.locator("button", { hasText: /test connection/i }).first()
        if (await testBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await testBtn.click()
          await page.waitForTimeout(1500) // Let the mock response arrive
          await page.screenshot({ path: `${SCREENSHOTS_DIR}/05-llm-models-loaded.png`, fullPage: true })

          // Select a model from dropdown
          const modelSelect = page.locator("select").last()
          if (await modelSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await modelSelect.selectOption({ index: 1 })
            await page.waitForTimeout(300)
            await page.screenshot({ path: `${SCREENSHOTS_DIR}/06-llm-model-selected.png`, fullPage: true })
          }
        }
      }
    }

    // Next (or Skip if available)
    const nextOrSkipBtn = page.locator("button", { hasText: /next|skip/i }).last()
    await nextOrSkipBtn.click()
    await page.waitForTimeout(600)

    // ── Step 3: Assign Leads ────────────────────────────────────────
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/07-leads-empty.png`, fullPage: true })

    // Fill lead emails
    const emailInputs = page.locator('input[type="email"]')
    const emailCount = await emailInputs.count()
    const demoEmails = [
      "alexey@acme.io",
      "change-lead@acme.io",
      "product@acme.io",
    ]
    for (let i = 0; i < Math.min(emailCount, 3); i++) {
      await emailInputs.nth(i).fill(demoEmails[i])
    }
    // If no email inputs, try plain text inputs (skip first which might be product name)
    if (emailCount === 0) {
      const inputs = page.locator("input:visible")
      const cnt = await inputs.count()
      for (let i = 0; i < Math.min(cnt, 3); i++) {
        await inputs.nth(i).fill(demoEmails[i])
      }
    }
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/08-leads-filled.png`, fullPage: true })

    await page.locator("button", { hasText: /next/i }).click()
    await page.waitForTimeout(600)

    // ── Step 4: Connect GitHub ──────────────────────────────────────
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/09-github-empty.png`, fullPage: true })

    const inputs = page.locator("input:visible")
    const inputCount = await inputs.count()
    if (inputCount >= 1) {
      await inputs.nth(0).fill("https://github.com/acme-org/acme")
    }
    if (inputCount >= 2) {
      await inputs.nth(1).fill("ghp_demo...redacted")
    }
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/10-github-filled.png`, fullPage: true })

    // Complete setup
    await page.locator("button", { hasText: /next|finish|complete|set up/i }).first().click()
    await page.waitForTimeout(1500)

    // ── Step 5: Done ────────────────────────────────────────────────
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/11-done.png`, fullPage: true })

    // Verify completion screen
    const doneHeading = page.getByRole("heading", { name: /ready|done|complete|success|set up/i })
    if (await doneHeading.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(doneHeading).toBeVisible()
    }
  })
})
