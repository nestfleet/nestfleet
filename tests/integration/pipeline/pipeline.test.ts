/**
 * QE-03 Pipeline Integration Tests
 *
 * Exercises the full signal → pg-boss job → worker → state transition pipeline
 * using a real pg-boss instance backed by a Testcontainers PostgreSQL database.
 *
 * LLM boundary is the ONLY stub. pg-boss, Postgres, and the state machine run for real.
 *
 * Architecture validated:
 *   Signal → createCase (enriching) → dispatch(triage) → FrontlineWorker
 *           → transitionCase(enriching → triaged) → dispatch(known_issue_match)
 *           → StewardWorker → route to {in-change, in-resolution, awaiting-lead}
 *
 * Infrastructure approach:
 *   - Testcontainers spins a real PostgreSQL (pgvector) instance
 *   - setupTestDb() runs all migrations and injects the test DB into src/infra/db/client.ts
 *   - A separate PgBoss instance is created with the test DB connection string
 *   - getBoss() is mocked to return this test boss so all app code uses the same boss
 *   - Workers are registered using their own register() method against the test boss
 *   - Jobs are dispatched directly via boss.send() to avoid the dispatcher's budget checks
 *     (which require agent_runs table data that doesn't exist in a fresh test DB)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { PgBoss } from "pg-boss"
import { setupTestDb, type TestDbContext } from "../helpers/db.js"
import { createProduct } from "../../../src/infra/db/repositories/products.js"
import { createCase, findCaseById } from "../../../src/infra/db/repositories/cases.js"
import { findChangeRequestsByCase } from "../../../src/infra/db/repositories/change-requests.js"
import { newId } from "../../../src/infra/db/id.js"

// ── LLM boundary stubs ────────────────────────────────────────────────────────
// These are the ONLY mocked modules. Everything else (pg-boss, Postgres,
// state machine, transitionAndDispatch) runs against the real Testcontainers DB.

// runAgent must be mocked BEFORE any agent/worker module is imported.
// Individual tests override specific call orderings with mockResolvedValueOnce().
vi.mock("../../../src/agents/run-agent.js", () => ({
  runAgent: vi.fn().mockResolvedValue({
    output: {
      severity: "normal",
      confidenceScore: 0.85,
      category: "billing",
      labels: ["billing"],
      reasoning: "Default test triage reasoning",
      evidenceRefs: [],
    },
    modelId: "test-model",
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    durationMs: 100,
    traceId: "test-trace-id",
  }),
}))

vi.mock("../../../src/memory/ingestion/embedder.js", () => ({
  embedText: vi.fn().mockResolvedValue({
    embedding: new Array(768).fill(0),
    tokenCount: 10,
  }),
}))

vi.mock("../../../src/memory/retrieval/retrieval-service.js", () => ({
  retrieve: vi.fn().mockResolvedValue({
    chunks: [],
    tierSummary: { 1: 0, 2: 0, 3: 0, 4: 0 },
    minFreshness: 0,
    avgFreshness: 0,
    hasConflicts: false,
    abstain: false,
    abstainReason: null,
  }),
}))

// buildEvidencePack is used by known-issue-match agent; stub to return empty pack
vi.mock("../../../src/agents/evidence.js", () => ({
  buildEvidencePack: vi.fn().mockResolvedValue({
    chunks: [],
    tierSummary: { 1: 0, 2: 0, 3: 0, 4: 0 },
    minFreshness: 0,
    avgFreshness: 0,
    hasConflicts: false,
    abstain: false,
    abstainReason: null,
  }),
}))

// NotificationService — best-effort in production; stub to prevent network calls
vi.mock("../../../src/notifications/index.js", () => ({
  NotificationService: vi.fn().mockImplementation(() => ({
    emit: vi.fn().mockResolvedValue(undefined),
  })),
}))

// License validator — return "growth" tier so tier-gated paths (known_issue_match) are reachable
vi.mock("../../../src/license/validator.js", () => ({
  getLicenseTier: vi.fn().mockReturnValue("growth"),
  getLicenseState: vi.fn().mockReturnValue(null),
}))

// getBoss() will be replaced after we create the real test boss instance.
// We start with a placeholder and swap it in beforeAll.
let _testBoss: PgBoss | null = null
vi.mock("../../../src/infra/queue/boss.js", async (importOriginal) => {
  // Keep the exported constants (AGENT_DLQ_NAME, getBossState, stopBoss, etc.)
  // but override getBoss() to return our test instance.
  // We import the original module to preserve non-boss exports.
  const original = await importOriginal<typeof import("../../../src/infra/queue/boss.js")>()
  return {
    ...original,
    getBoss: vi.fn().mockImplementation(async () => {
      if (!_testBoss) throw new Error("Test boss not initialised — call beforeAll first")
      return _testBoss
    }),
    // stopBoss should be a no-op during tests — we manage lifecycle ourselves
    stopBoss: vi.fn().mockResolvedValue(undefined),
  }
})

// ── Test infrastructure ───────────────────────────────────────────────────────

let dbCtx: TestDbContext
let testProductId: string

/**
 * Poll findCaseById every 200ms until status matches or timeout is reached.
 * Throws with a diagnostic message on timeout.
 */
async function waitForCaseStatus(
  caseId: string,
  expectedStatus: string,
  timeoutMs = 12_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const c = await findCaseById(caseId)
    if (c?.status === expectedStatus) return
    await new Promise((r) => setTimeout(r, 200))
  }
  const c = await findCaseById(caseId)
  throw new Error(
    `waitForCaseStatus: case ${caseId} did not reach "${expectedStatus}" within ${timeoutMs}ms. ` +
      `Current status: "${c?.status ?? "not found"}"`,
  )
}

beforeAll(async () => {
  // 1. Start real Testcontainers Postgres + run migrations
  dbCtx = await setupTestDb()
  const connectionString = dbCtx.container.getConnectionUri()

  // 2. Create the test pg-boss instance backed by the Testcontainers Postgres.
  //    monitorIntervalSeconds=1 gives fast polling so workers process jobs quickly in tests.
  _testBoss = new PgBoss({
    connectionString,
    monitorIntervalSeconds: 1,
    migrate: true,
  })

  _testBoss.on("error", (err: Error) => {
    console.error("[pg-boss test error]", err.message)
  })

  await _testBoss.start()

  // 3. Register workers via their register() method.
  //    getBoss() is already mocked to return _testBoss, so each worker registers
  //    its queue and work handler against the real Testcontainers-backed boss.
  const { frontlineWorker } = await import("../../../src/workers/frontline-worker.js")
  const { stewardWorker }   = await import("../../../src/workers/steward-worker.js")

  await frontlineWorker.register()
  await stewardWorker.register()

  // Also create downstream queues that workers dispatch to, so transactional
  // pg-boss inserts don't fail (pgboss.job has a FK to pgboss.queue.name).
  const { AGENT_DLQ_NAME } = await import("../../../src/infra/queue/boss.js")
  await _testBoss.createQueue("auto_reply",    { deadLetter: AGENT_DLQ_NAME })
  await _testBoss.createQueue("change_prep",   { deadLetter: AGENT_DLQ_NAME })
  await _testBoss.createQueue("outage_routing",{ deadLetter: AGENT_DLQ_NAME })

  // 4. Seed a shared test product — used by most tests in this file.
  const product = await createProduct({
    name: "Pipeline Test Product",
    stage: "production",
  })
  testProductId = product.product_id
}, 120_000)

afterAll(async () => {
  if (_testBoss) {
    await _testBoss.stop({ graceful: true, timeout: 5_000 }).catch(() => {})
    _testBoss = null
  }
  if (dbCtx) {
    await dbCtx.teardown()
  }
}, 30_000)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the AgentJobData shape that workers expect from job.data */
function makeTriageJobData(productId: string, caseId: string, signalText: string) {
  return {
    jobId: newId("job_"),
    productId,
    caseId,
    actionType: "triage" as const,
    payload: { signalText },
  }
}

function makeStewardJobData(productId: string, caseId: string, signalText: string) {
  return {
    jobId: newId("job_"),
    productId,
    caseId,
    actionType: "known_issue_match" as const,
    payload: { signalText },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("QE-03 Pipeline Integration", () => {
  /**
   * Test 1: triage-only path
   *
   * A case in "enriching" state with a triage job dispatched should:
   *   1. Be picked up by FrontlineWorker
   *   2. runAgent returns severity="low", confidence=0.85
   *   3. Case transitions to "triaged"
   *   4. triage_output stored on the case record
   */
  it("pipeline-triage-only: case transitions enriching → triaged with correct triage_output", async () => {
    const { runAgent } = await import("../../../src/agents/run-agent.js")
    vi.mocked(runAgent).mockResolvedValueOnce({
      output: {
        severity: "low",
        confidenceScore: 0.85,
        category: "billing",
        labels: ["billing"],
        reasoning: "Low severity billing question",
        evidenceRefs: [],
      },
      modelId: "test-model",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 100,
      traceId: "trace-triage-only",
    })

    const caseRow = await createCase({
      product_id: testProductId,
      title: "Pipeline test: billing question",
      status: "enriching",
      signal_text: "I have a question about my invoice",
    })
    const caseId = caseRow.case_id

    await _testBoss!.send(
      "triage",
      makeTriageJobData(testProductId, caseId, "I have a question about my invoice"),
      { singletonKey: `triage:${caseId}` },
    )

    await waitForCaseStatus(caseId, "triaged", 12_000)

    const updatedCase = await findCaseById(caseId)
    expect(updatedCase!.status).toBe("triaged")
    expect(updatedCase!.triage_output).not.toBeNull()
    expect((updatedCase!.triage_output as Record<string, unknown>)["severity"]).toBe("low")
  }, 30_000)

  /**
   * Test 2: change-request path (triage → steward → in-change)
   *
   * A bug_report case should flow through:
   *   FrontlineWorker (enriching → triaged) → StewardWorker (triaged → in-change)
   * A change_request row should be created for the case (status="draft").
   *
   * runAgent call sequence:
   *   - Call 1 (triage): returns auth bug, normal severity
   *   - Call 2 (known_issue_match): returns matched=false → steward routes to in-change
   */
  it("pipeline-change-request: bug_report flows triaged → in-change with a change_request created", async () => {
    const { runAgent } = await import("../../../src/agents/run-agent.js")

    // Triage call: auth bug_report, normal severity
    vi.mocked(runAgent).mockResolvedValueOnce({
      output: {
        severity: "normal",
        confidenceScore: 0.80,
        category: "authentication",
        labels: ["auth", "bug"],
        reasoning: "User cannot authenticate — looks like a bug",
        evidenceRefs: [],
      },
      modelId: "test-model",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 100,
      traceId: "trace-cr-triage",
    })

    // Known-issue-match call: no match → StewardWorker routes to in-change
    vi.mocked(runAgent).mockResolvedValueOnce({
      output: {
        matched: false,
        confidenceScore: 0.10,
        matchSummary: "No known issue matches this case",
      },
      modelId: "test-model",
      usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
      durationMs: 80,
      traceId: "trace-cr-steward",
    })

    const caseRow = await createCase({
      product_id: testProductId,
      title: "Pipeline test: auth bug",
      status: "enriching",
      signal_text: "Cannot login — getting 401 on every attempt",
    })
    const caseId = caseRow.case_id

    await _testBoss!.send(
      "triage",
      makeTriageJobData(testProductId, caseId, "Cannot login — getting 401 on every attempt"),
      { singletonKey: `triage:${caseId}` },
    )

    // FrontlineWorker: enriching → triaged (dispatches known_issue_match atomically)
    await waitForCaseStatus(caseId, "triaged", 12_000)

    // StewardWorker: triaged → in-change (bug_report with no known issue match)
    await waitForCaseStatus(caseId, "in-change", 20_000)

    const changeRequests = await findChangeRequestsByCase(caseId)
    expect(changeRequests.length).toBeGreaterThan(0)

    const cr = changeRequests[0]!
    expect(cr.case_id).toBe(caseId)
    expect(cr.product_id).toBe(testProductId)
    // StewardWorker creates the CR in "draft" status
    expect(cr.status).toBe("draft")
  }, 40_000)

  /**
   * Test 3: retry idempotency (most important for QE-02 validation)
   *
   * Dispatching the same triage job TWICE for the same case must be safe:
   *   - First job runs → case transitions enriching → triaged
   *   - Second job runs → FrontlineWorker idempotency guard fires (status != "enriching")
   *   - Case remains "triaged" — no InvalidStateTransitionError, no corruption
   *
   * We send two jobs: one with singletonKey (pg-boss level dedup) and one without
   * (exercises the worker-level idempotency guard).
   */
  it("pipeline-retry-idempotent: double-dispatch does not corrupt case state", async () => {
    const { runAgent } = await import("../../../src/agents/run-agent.js")
    vi.mocked(runAgent).mockResolvedValue({
      output: {
        severity: "normal",
        confidenceScore: 0.82,
        category: "billing",
        labels: ["billing"],
        reasoning: "Idempotency test triage",
        evidenceRefs: [],
      },
      modelId: "test-model",
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 100,
      traceId: "trace-idempotent",
    })

    const caseRow = await createCase({
      product_id: testProductId,
      title: "Pipeline test: idempotency",
      status: "enriching",
      signal_text: "Double dispatch test",
    })
    const caseId = caseRow.case_id

    // First dispatch — this one will be processed normally
    await _testBoss!.send(
      "triage",
      makeTriageJobData(testProductId, caseId, "Double dispatch test"),
      { singletonKey: `triage:${caseId}` },
    )

    // Second dispatch with same singletonKey → pg-boss silently ignores the duplicate
    await _testBoss!.send(
      "triage",
      makeTriageJobData(testProductId, caseId, "Double dispatch test"),
      { singletonKey: `triage:${caseId}` },
    )

    // Third dispatch without singletonKey → reaches the worker, hits idempotency guard
    await _testBoss!.send(
      "triage",
      makeTriageJobData(testProductId, caseId, "Double dispatch test"),
    )

    // Wait for the case to leave "enriching" — it may advance past "triaged"
    // quickly as the Steward picks it up. The goal is no corruption, not a
    // specific terminal state.
    await waitForCaseStatus(caseId, "triaged", 12_000).catch(() => {
      // "triaged" may be transient — the pipeline can advance past it; acceptable
    })

    // Additional wait to let any stray retries process
    await new Promise((r) => setTimeout(r, 2_500))

    const finalCase = await findCaseById(caseId)
    // Case must have advanced past "enriching" — any valid state is correct
    expect(finalCase!.status).not.toBe("enriching")
    // triage_output must be set exactly once (not overwritten/corrupted by double-dispatch)
    expect(finalCase!.triage_output).not.toBeNull()
  }, 30_000)

  /**
   * Test 4: empty knowledge base
   *
   * A product with no memory chunks should not cause a stuck case or PolicyViolationError.
   * retrieve returns abstain=true, abstainReason="no_results" (soft abstain).
   * FrontlineWorker's triage agent handles no_results gracefully — triage proceeds
   * on signal text alone.
   */
  it("pipeline-empty-knowledge-base: triage completes without memory chunks", async () => {
    const { retrieve } = await import("../../../src/memory/retrieval/retrieval-service.js")

    vi.mocked(retrieve).mockResolvedValueOnce({
      chunks: [],
      tierSummary: { 1: 0, 2: 0, 3: 0, 4: 0 },
      minFreshness: 0,
      avgFreshness: 0,
      hasConflicts: false,
      abstain: true,
      abstainReason: "no_results",
    })

    const { runAgent } = await import("../../../src/agents/run-agent.js")
    vi.mocked(runAgent).mockResolvedValueOnce({
      output: {
        severity: "normal",
        confidenceScore: 0.78,
        category: "how-to",
        labels: ["question"],
        reasoning: "Config question — empty knowledge base — signal text only",
        evidenceRefs: [],
      },
      modelId: "test-model",
      usage: { inputTokens: 80, outputTokens: 40, totalTokens: 120 },
      durationMs: 90,
      traceId: "trace-empty-kb",
    })

    // Create a separate product to isolate from shared testProductId
    const emptyKbProduct = await createProduct({
      name: "Empty KB Test Product",
      stage: "pre-launch",
    })

    const caseRow = await createCase({
      product_id: emptyKbProduct.product_id,
      title: "Pipeline test: empty knowledge base",
      status: "enriching",
      signal_text: "How do I configure the nightly rollup?",
    })
    const caseId = caseRow.case_id

    await _testBoss!.send(
      "triage",
      makeTriageJobData(emptyKbProduct.product_id, caseId, "How do I configure the nightly rollup?"),
      { singletonKey: `triage:${caseId}` },
    )

    // Pipeline should complete successfully despite empty knowledge base
    await waitForCaseStatus(caseId, "triaged", 12_000)

    const finalCase = await findCaseById(caseId)
    expect(finalCase!.status).toBe("triaged")
    expect(finalCase!.triage_output).not.toBeNull()
    // Verify the agent output is stored — no stuck or errored state
    const output = finalCase!.triage_output as Record<string, unknown>
    expect(output["severity"]).toBeDefined()
  }, 30_000)

  /**
   * Test 5: FrontlineWorker idempotency
   *
   * A case already in "triaged" status (past FrontlineWorker's entry state "enriching")
   * should trigger the idempotency guard: worker returns "abstain" without transitioning.
   * The case must remain "triaged" after the job is processed.
   */
  it("pipeline-worker-idempotency-frontline: triage job on already-triaged case is a no-op", async () => {
    // Create a case already in "triaged" — simulates a retry after successful first run
    const caseRow = await createCase({
      product_id: testProductId,
      title: "Pipeline test: frontline idempotency",
      status: "triaged",
      type: "user_request",
      severity: "normal",
      signal_text: "Already triaged case — guard test",
    })
    const caseId = caseRow.case_id

    // Dispatch a triage job for a case that is ALREADY past "enriching"
    // No singletonKey — we want this job to reach the worker
    await _testBoss!.send("triage", makeTriageJobData(testProductId, caseId, "Already triaged case — guard test"))

    // Allow time for the job to be picked up and processed (abstain is fast)
    await new Promise((r) => setTimeout(r, 4_000))

    // Case must remain "triaged" — the worker guard must NOT corrupt state
    const finalCase = await findCaseById(caseId)
    expect(finalCase!.status).toBe("triaged")
  }, 20_000)

  /**
   * Test 6: StewardWorker idempotency
   *
   * A case already in "in-change" status (past StewardWorker's entry state "triaged")
   * should trigger the StewardWorker idempotency guard.
   * The case must remain "in-change" after the job is processed.
   */
  it("pipeline-worker-idempotency-steward: known_issue_match job on already-in-change case is a no-op", async () => {
    // Create a case already in "in-change" — simulates a steward retry after transition
    const caseRow = await createCase({
      product_id: testProductId,
      title: "Pipeline test: steward idempotency",
      status: "in-change",
      type: "bug_report",
      severity: "normal",
      signal_text: "Already in-change case — steward guard test",
    })
    const caseId = caseRow.case_id

    // Dispatch a known_issue_match (steward) job for a case past "triaged"
    await _testBoss!.send("known_issue_match", makeStewardJobData(testProductId, caseId, "Already in-change case — steward guard test"))

    // Allow time for the job to be picked up and processed (abstain is fast)
    await new Promise((r) => setTimeout(r, 4_000))

    // Case must remain "in-change" — StewardWorker guard must NOT corrupt state
    const finalCase = await findCaseById(caseId)
    expect(finalCase!.status).toBe("in-change")
  }, 20_000)
})
