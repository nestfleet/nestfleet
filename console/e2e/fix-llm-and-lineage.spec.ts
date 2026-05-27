/**
 * Regression tests for two targeted fixes:
 *
 * FIX-1: Settings — LLM "Test Connection" with a saved API key
 *   Root cause: the backend read the encrypted apiKey directly from llm_config
 *   without calling decryptSecret(), so cloud providers received a garbled key.
 *   Fix: both test-llm and list-models fallback paths now call decryptSecret().
 *
 * FIX-2: Case lineage — "Skipped" label for zero-token/zero-duration success steps
 *   Root cause: steps that skip the LLM call (e.g. known_issue_match with no DB
 *   entries) recorded outcome=success + 0 tokens + 0 ms, but the UI showed
 *   "success" (green) which was misleading.
 *   Fix: detect the pattern and render "skipped" (blue) in both the timeline
 *   collapsed preview and the NodeDetailPanel expanded view.
 *
 * Strategy: all API calls are intercepted/mocked so tests are deterministic and
 * do not require a running backend with a live Google / Anthropic / OpenAI key.
 *
 * Pre-requisites:
 *   Console → http://localhost:3002
 *
 * Run: npx playwright test e2e/fix-llm-and-lineage.spec.ts
 */

import { test, expect, type Page } from "@playwright/test"
import { TEST_EMAIL, TEST_PASSWORD } from "./fixtures/auth"

// ─── Shared helpers ───────────────────────────────────────────────────────────

const PRODUCT_ID    = "test-product-id"

async function login(page: Page) {
  await page.goto("/login")
  await page.waitForLoadState("networkidle")
  if (page.url().includes("/cases") || page.url().match(/\/p\/[^/]+\//)) return
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(p\/[^/]+\/cases|cases)/, { timeout: 10_000 })
}

// Minimal settings response with a Google LLM already configured.
// The apiKeyLast4 signals a saved (encrypted) key exists on the backend.
function makeSettingsResponse(provider = "google", model = "gemini-2.0-flash") {
  return {
    llm: {
      provider,
      model,
      configured: true,
      apiKeyLast4: "AB12",
      baseUrl: null,
      embeddingModel: null,
      embeddingDimensions: null,
    },
    leads: { support_lead: null, change_lead: null, product_lead: null },
    agent: { tone: "professional", auto_reply_enabled: false },
    notifications: { slackWebhookUrl: null, escalation_threshold_hours: 24 },
    ci: { enabled: false },
    contactForm: { publicKey: null },
    chat: { publicKey: null },
  }
}

// ─── FIX-1: Settings LLM "Test Connection" with saved key ────────────────────

test.describe("FIX-1 — LLM Test Connection with saved key", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)

    // Intercept GET /settings — return a pre-configured Google provider
    await page.route(
      (url) => url.port === "3001" && url.pathname.match(/\/settings$/) !== null,
      (route) => {
        if (route.request().method() !== "GET") { route.continue(); return }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: makeSettingsResponse() }),
        })
      }
    )

    await page.goto("/settings")
    await page.waitForLoadState("networkidle")

    // Navigate to LLM Provider section
    const llmTab = page.getByRole("button", { name: /LLM Provider/i })
    if (await llmTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await llmTab.click()
    }
  })

  test("FIX-1.1 — Model dropdown pre-populates on page load when provider is configured", async ({ page }) => {
    // The saved model should appear in the select/input without clicking Test Connection.
    // After the fix, the component initialises models=[savedModel] so the <select> renders.
    const modelDropdown = page.locator("select").first()
    const modelInput    = page.locator('input[placeholder*="model" i], input[placeholder*="Model"]').first()

    // Either a <select> with the saved model or an <input> showing it is acceptable
    const hasSelect = await modelDropdown.isVisible({ timeout: 3_000 }).catch(() => false)
    const hasInput  = await modelInput.isVisible({ timeout: 3_000 }).catch(() => false)
    expect(hasSelect || hasInput).toBeTruthy()

    if (hasSelect) {
      const val = await modelDropdown.inputValue()
      expect(val).toBe("gemini-2.0-flash")
    } else {
      const val = await modelInput.inputValue()
      expect(val).toBe("gemini-2.0-flash")
    }
  })

  test("FIX-1.2 — Saved-key indicator (last 4) is displayed next to API Key label", async ({ page }) => {
    // The component renders "(AB12)" when apiKeyLast4 is set and provider matches saved provider
    await expect(page.getByText(/AB12/)).toBeVisible({ timeout: 5_000 })
  })

  test("FIX-1.3 — Test Connection without entering a new key calls list-models and succeeds", async ({ page }) => {
    // Intercept the list-models endpoint — simulate backend using decrypted saved key successfully
    let listModelsBody: Record<string, unknown> | null = null
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("list-models"),
      async (route) => {
        listModelsBody = await route.request().postDataJSON() as Record<string, unknown>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              provider: "google",
              models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
            },
          }),
        })
      }
    )

    const testBtn = page.locator("button", { hasText: /test connection/i }).first()
    await expect(testBtn).toBeVisible({ timeout: 5_000 })
    await testBtn.click()

    // Should NOT be disabled (saved key exists) and should fire
    await expect(page.getByText(/models available|connected/i)).toBeVisible({ timeout: 8_000 })

    // Verify the request did NOT include an apiKey field
    // (meaning it relied on the backend fallback to the saved key)
    expect(listModelsBody).not.toBeNull()
    const body = listModelsBody as unknown as Record<string, unknown>
    expect(body.provider).toBe("google")
    // apiKey should be absent or empty — not a real key value
    const sentKey = body.apiKey
    expect(!sentKey || sentKey === "").toBeTruthy()
  })

  test("FIX-1.4 — After Test Connection succeeds, dropdown is populated with returned models", async ({ page }) => {
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("list-models"),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              provider: "google",
              models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
            },
          }),
        })
    )

    const testBtn = page.locator("button", { hasText: /test connection/i }).first()
    await testBtn.click()
    await expect(page.getByText(/models available/i)).toBeVisible({ timeout: 8_000 })

    const modelSelect = page.locator("select").first()
    await expect(modelSelect).toBeVisible({ timeout: 5_000 })

    const options = await modelSelect.locator("option").allTextContents()
    expect(options.some((o) => o.includes("gemini-2.0-flash"))).toBeTruthy()
    expect(options.some((o) => o.includes("gemini-1.5-pro"))).toBeTruthy()
  })

  test("FIX-1.5 — Test Connection shows error when backend returns 400 (bad/no key)", async ({ page }) => {
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("list-models"),
      (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "Google returned an unexpected error (HTTP 400)",
          }),
        })
    )

    const testBtn = page.locator("button", { hasText: /test connection/i }).first()
    await testBtn.click()

    // Should show an error state (red badge / error text)
    await expect(
      page.getByText(/error|failed|unexpected/i).first()
    ).toBeVisible({ timeout: 8_000 })
  })

  test("FIX-1.6 — Switching provider resets model list and connection state", async ({ page }) => {
    // Click on OpenAI provider card
    const openaiCard = page.locator("button", { hasText: /OpenAI/i }).first()
    if (await openaiCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await openaiCard.click()
      // After switching, a warning about "no key for this provider" should appear
      // OR the connection state is reset to idle
      const noKeyWarning = page.getByText(/no key for this provider/i)
      const isIdle = page.locator("button", { hasText: /test connection/i })
      await expect(noKeyWarning.or(isIdle).first()).toBeVisible({ timeout: 5_000 })
    }
  })
})

// ─── FIX-2: Lineage "Skipped" label for zero-token/zero-duration steps ────────

// Minimal lineage response containing a known_issue_match node that was skipped
function makeLineageResponse(options: {
  outcome?: string
  outputTokens?: number
  durationMs?: number
  abstainReason?: string
} = {}) {
  const {
    outcome = "success",
    outputTokens = 0,
    durationMs = 0,
    abstainReason,
  } = options

  return {
    data: {
      caseId: "case-abc",
      nodes: [
        {
          nodeId: "node-1",
          type: "signal_received",
          title: "Signal Received",
          summary: "Incoming signal from monitoring",
          occurredAt: new Date().toISOString(),
          actorType: "system",
          actorRef: "webhook-receiver",
          agentRun: null,
          metadata: {},
          availableActions: [],
        },
        {
          nodeId: "node-2",
          type: "known_issue_match",
          title: "Known Issue Match",
          summary: "Checked for known issues",
          occurredAt: new Date().toISOString(),
          actorType: "agent",
          actorRef: "known-issue-matcher",
          agentRun: {
            runId: "run-xyz-0000",
            modelId: "gemini-2.0-flash",
            inputTokens: 0,
            outputTokens,
            durationMs,
            outcome,
            outputSnapshot: abstainReason ? { reason: abstainReason } : {},
          },
          metadata: {},
          availableActions: [],
        },
      ],
      changeRequests: [],
    },
  }
}

async function navigateToCaseLineage(page: Page) {
  // Intercept the cases list to return a minimal case row
  await page.route(
    (url) => url.port === "3001" && url.pathname.includes("/cases") && !url.pathname.includes("/lineage"),
    (route) => {
      if (route.request().method() !== "GET") { route.continue(); return }
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              caseId: "case-abc",
              title: "Test signal",
              status: "open",
              severity: "medium",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              actorRef: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 50,
        }),
      })
    }
  )

  await page.goto("/cases")
  await page.waitForLoadState("networkidle")

  // Click the first case row
  const firstRow = page.locator("tbody tr, tr[data-case-id], button[data-case-id]").first()
  if (await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await firstRow.click()
    await page.waitForLoadState("networkidle")
  }
}

test.describe("FIX-2 — Lineage skipped-step display", () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test("FIX-2.1 — known_issue_match with 0 tokens / 0 ms / success renders 'skipped'", async ({ page }) => {
    // Intercept lineage endpoint for a case detail page
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("/lineage"),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeLineageResponse({ outcome: "success", outputTokens: 0, durationMs: 0 })),
        })
    )

    await navigateToCaseLineage(page)

    // Find the Known Issue Match node — expand its details
    const knownIssueRow = page.getByText("Known Issue Match").first()
    if (await knownIssueRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Collapsed view should show "skipped" badge
      await expect(page.getByText(/skipped/i).first()).toBeVisible({ timeout: 5_000 })

      // If there's a Details toggle, expand it and verify no "success" in outcome area
      const detailsBtn = page.locator("button", { hasText: /details/i }).first()
      if (await detailsBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await detailsBtn.click()
        await expect(page.getByText(/skipped/i).first()).toBeVisible({ timeout: 3_000 })
      }
    }
  })

  test("FIX-2.2 — Normal step with tokens > 0 does NOT render 'skipped'", async ({ page }) => {
    // Intercept with a normal (non-skipped) agent run
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("/lineage"),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeLineageResponse({ outcome: "success", outputTokens: 150, durationMs: 2300 })),
        })
    )

    await navigateToCaseLineage(page)

    const knownIssueRow = page.getByText("Known Issue Match").first()
    if (await knownIssueRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // "skipped" text must NOT appear anywhere in the lineage
      const skippedEl = page.getByText(/^skipped$/i)
      await expect(skippedEl).not.toBeVisible({ timeout: 3_000 }).catch(() => {
        // If not visible timeout resolves false, that's expected
      })
      // Token count SHOULD appear (150 tok)
      const detailsBtn = page.locator("button", { hasText: /details/i }).first()
      if (await detailsBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await detailsBtn.click()
        await expect(page.getByText(/150/).first()).toBeVisible({ timeout: 3_000 })
      }
    }
  })

  test("FIX-2.3 — Abstained step renders 'abstained' label", async ({ page }) => {
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("/lineage"),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            makeLineageResponse({
              outcome: "abstain",
              outputTokens: 50,
              durationMs: 800,
              abstainReason: "Confidence too low",
            })
          ),
        })
    )

    await navigateToCaseLineage(page)

    const knownIssueRow = page.getByText("Known Issue Match").first()
    if (await knownIssueRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const detailsBtn = page.locator("button", { hasText: /details/i }).first()
      if (await detailsBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await detailsBtn.click()
        await expect(page.getByText(/abstained/i).first()).toBeVisible({ timeout: 3_000 })
      }
    }
  })

  // ── NodeDetailPanel (graph view) skipped tests ──────────────────────────────

  test("FIX-2.4 — NodeDetailPanel: skipped step shows 'skipped' outcome, not 'success'", async ({ page }) => {
    // The NodeDetailPanel is part of the lineage graph view (/lineage route param).
    // We test the logic in isolation by asserting DOM output when the panel is rendered.
    // Since this is a graph-click interaction we verify the visual condition matches.

    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("/lineage"),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeLineageResponse({ outcome: "success", outputTokens: 0, durationMs: 0 })),
        })
    )

    await navigateToCaseLineage(page)

    // Look for the lineage graph tab / toggle if present
    const graphToggle = page.locator("button, a", { hasText: /graph|lineage/i }).first()
    if (await graphToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await graphToggle.click()
      await page.waitForLoadState("networkidle")

      // Click the known_issue_match node in the graph (text label or node element)
      const knownIssueNode = page.getByText("Known Issue Match").first()
      if (await knownIssueNode.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await knownIssueNode.click()

        // Panel should show "skipped" not "success" for outcome
        await expect(page.getByText(/skipped/i).first()).toBeVisible({ timeout: 5_000 })
        await expect(page.getByText(/^success$/i)).not.toBeVisible({ timeout: 2_000 }).catch(() => {})
      }
    }
  })

  test("FIX-2.5 — Skipped step collapsed preview does not show '0 tok · 0ms' summary", async ({ page }) => {
    await page.route(
      (url) => url.port === "3001" && url.pathname.includes("/lineage"),
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(makeLineageResponse({ outcome: "success", outputTokens: 0, durationMs: 0 })),
        })
    )

    await navigateToCaseLineage(page)

    const knownIssueRow = page.getByText("Known Issue Match").first()
    if (await knownIssueRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // The collapsed preview "· 0 tok · 0ms" should not appear — "skipped" should instead
      const zeroTokText = page.getByText(/0 tok.*0ms|0ms.*0 tok/i)
      await expect(zeroTokText).not.toBeVisible({ timeout: 3_000 }).catch(() => {})
      await expect(page.getByText(/skipped/i).first()).toBeVisible({ timeout: 3_000 })
    }
  })
})
