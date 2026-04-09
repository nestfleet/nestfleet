/**
 * QE-04: Post-deploy pipeline smoke test.
 *
 * Fires a canary signal through the external webhook, then polls the cases API
 * until the resulting case reaches "triaged" status.  Exits 0 on success, 1
 * on failure or timeout.
 *
 * Required env vars:
 *   SMOKE_BASE_URL        — e.g. https://nestfleet.dev
 *   SMOKE_PRODUCT_ID      — product UUID / slug that owns the webhook
 *   SMOKE_WEBHOOK_SECRET  — raw API key stored in product.support_policy.externalWebhookApiKey
 *   SMOKE_API_TOKEN       — operator JWT for GET /api/v1/products/:productId/cases
 *
 * Run with:  tsx scripts/smoke-pipeline.ts
 */

// Mark as ESM module so top-level await is valid under tsc
export {}

// ── Env ───────────────────────────────────────────────────────────────────────

const BASE_URL        = process.env["SMOKE_BASE_URL"]?.replace(/\/$/, "")
const PRODUCT_ID      = process.env["SMOKE_PRODUCT_ID"]
const WEBHOOK_SECRET  = process.env["SMOKE_WEBHOOK_SECRET"]
const API_TOKEN       = process.env["SMOKE_API_TOKEN"]

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`SMOKE FAILED: missing required env var ${name}`)
    process.exit(1)
  }
  return value
}

const baseUrl       = requireEnv("SMOKE_BASE_URL",       BASE_URL)
const productId     = requireEnv("SMOKE_PRODUCT_ID",     PRODUCT_ID)
const webhookSecret = requireEnv("SMOKE_WEBHOOK_SECRET", WEBHOOK_SECRET)
const apiToken      = requireEnv("SMOKE_API_TOKEN",      API_TOKEN)

// ── Constants ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000
const TIMEOUT_MS       = 60_000
const SCAN_LIMIT       = 50   // cases to scan per poll

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface FetchResult {
  ok:     boolean
  status: number
  body:   unknown
}

async function safeFetch(
  url: string,
  init: RequestInit,
): Promise<FetchResult> {
  try {
    const res  = await fetch(url, init)
    let body: unknown
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      body = await res.json()
    } else {
      body = await res.text()
    }
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`SMOKE FAILED: network error reaching ${url} — ${message}`)
    process.exit(1)
  }
}

// ── Types (minimal — only what we inspect) ────────────────────────────────────

interface CaseRow {
  case_id:       string
  title:         string | null
  signal_text:   string | null
  status:        string
  triage_output: Record<string, unknown> | null
}

interface CasesResponse {
  data: CaseRow[]
}

// ── Step 1: fire the canary signal ────────────────────────────────────────────

const correlationId = `smoke-${Date.now()}`
const smokeMessage  = `Smoke test signal ${correlationId} — ignore`

console.log(`[smoke] correlationId: ${correlationId}`)
console.log(`[smoke] POSTing canary signal to ${baseUrl}/webhooks/external/${productId}`)

const webhookResult = await safeFetch(
  `${baseUrl}/webhooks/external/${productId}`,
  {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${webhookSecret}`,
    },
    body: JSON.stringify({
      // External webhook schema: threadId, senderName, senderRef, message are all required.
      // Use correlationId as threadId so each smoke run creates a fresh thread.
      threadId:   correlationId,
      senderName: "smoke-test",
      senderRef:  `smoke-test/${correlationId}`,
      message:    smokeMessage,
      channelContext: { source: "smoke-test", correlationId },
    }),
  },
)

if (!webhookResult.ok) {
  console.error(
    `SMOKE FAILED: webhook POST returned ${webhookResult.status}`,
    webhookResult.body,
  )
  process.exit(1)
}

console.log(`[smoke] webhook accepted (${webhookResult.status}):`, webhookResult.body)

// ── Step 2: poll until the case is triaged ────────────────────────────────────

console.log(`[smoke] polling cases API every ${POLL_INTERVAL_MS / 1000}s (timeout ${TIMEOUT_MS / 1000}s) …`)

const deadline = Date.now() + TIMEOUT_MS
let   matchedCase: CaseRow | null = null

while (Date.now() < deadline) {
  await sleep(POLL_INTERVAL_MS)

  const listResult = await safeFetch(
    `${baseUrl}/api/v1/products/${productId}/cases?limit=${SCAN_LIMIT}&offset=0`,
    {
      method:  "GET",
      headers: { "Authorization": `Bearer ${apiToken}` },
    },
  )

  if (!listResult.ok) {
    // A transient non-200 (e.g. 503) should not abort immediately — keep polling
    console.warn(`[smoke] cases API returned ${listResult.status} — will retry`)
    continue
  }

  const payload = listResult.body as CasesResponse
  const cases   = Array.isArray(payload?.data) ? payload.data : []

  // Scan for the canary by correlationId embedded in title or signal_text
  const candidate = cases.find((c) => {
    const haystack = `${c.title ?? ""} ${c.signal_text ?? ""}`.toLowerCase()
    return haystack.includes(correlationId.toLowerCase())
  })

  if (!candidate) {
    console.log(`[smoke] case not yet visible — waiting …`)
    continue
  }

  console.log(`[smoke] found case ${candidate.case_id}, status: ${candidate.status}`)

  if (candidate.status === "triaged") {
    matchedCase = candidate
    break
  }

  // Any terminal non-triaged status means the pipeline ended in a wrong state
  const terminalStatuses = new Set(["closed", "resolved"])
  if (terminalStatuses.has(candidate.status)) {
    console.error(
      `SMOKE FAILED: case reached terminal status "${candidate.status}" without triaging`,
    )
    process.exit(1)
  }
}

// ── Step 3: evaluate outcome ──────────────────────────────────────────────────

if (!matchedCase) {
  console.error(`SMOKE FAILED: pipeline did not complete within ${TIMEOUT_MS / 1000}s`)
  process.exit(1)
}

if (!matchedCase.triage_output || Object.keys(matchedCase.triage_output).length === 0) {
  console.error(
    `SMOKE FAILED: case ${matchedCase.case_id} is triaged but triage_output is empty`,
    matchedCase.triage_output,
  )
  process.exit(1)
}

console.log(`SMOKE PASSED: case ${matchedCase.case_id} triaged successfully`)
console.log(`[smoke] triage_output keys: ${Object.keys(matchedCase.triage_output).join(", ")}`)

// ── Step 4: best-effort cleanup — resolve the canary case ─────────────────────

const resolveUrl = `${baseUrl}/api/v1/products/${productId}/cases/${matchedCase.case_id}`
try {
  const cleanupResult = await safeFetch(resolveUrl, {
    method:  "PATCH",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify({ status: "resolved" }),
  })
  if (cleanupResult.ok) {
    console.log(`[smoke] cleanup: canary case ${matchedCase.case_id} resolved`)
  } else {
    console.warn(
      `[smoke] cleanup: PATCH returned ${cleanupResult.status} (non-fatal)`,
      cleanupResult.body,
    )
  }
} catch {
  console.warn(`[smoke] cleanup failed (non-fatal)`)
}

process.exit(0)
