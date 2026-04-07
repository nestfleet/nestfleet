/**
 * SPIKE-01 evaluation dataset.
 * 35 prompts across 6 categories that validate the product memory system
 * against expected retrieval behavior.
 *
 * Category breakdown:
 *   A. Happy path — direct T1/T2 hits, expect NO abstain
 *   B. Freshness degradation — stale T1, expect stale_evidence abstain
 *   C. Tier gate — only T3/T4 available, expect insufficient_tier abstain
 *   D. Conflict detection — conflicting chunks, expect knowledge_conflict abstain
 *   E. Audience gate — public query, only internal chunks available
 *   F. Empty corpus — no data ingested, expect no_results abstain
 */

export interface EvalCase {
  id: string
  category: "happy_path" | "freshness" | "tier_gate" | "conflict" | "audience" | "empty_corpus"
  description: string
  queryText: string
  actionType: "auto_reply" | "triage" | "known_issue_match" | "change_prep" | "pr_draft_prep" | "outage_routing"
  audience: "public" | "internal"
  expectedAbstain: boolean
  expectedAbstainReason?: string
  /** Minimum number of chunks expected in pack when NOT abstaining */
  expectedMinChunks?: number
  /** At least one chunk should have tier <= this value */
  expectedMaxTier?: number
  /** All chunks should have freshness >= this value */
  expectedMinFreshness?: number
}

export const EVAL_DATASET: EvalCase[] = [
  // ── A. Happy Path ─────────────────────────────────────────────────────────

  {
    id: "A-01",
    category: "happy_path",
    description: "Direct T1 FAQ hit — common support question",
    queryText: "How do I reset my password?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: false,
    expectedMinChunks: 1,
    expectedMaxTier: 1,
  },
  {
    id: "A-02",
    category: "happy_path",
    description: "Known issue match — specific error message",
    queryText: "Getting 'connection timeout' when uploading large files",
    actionType: "known_issue_match",
    audience: "public",
    expectedAbstain: false,
    expectedMinChunks: 1,
  },
  {
    id: "A-03",
    category: "happy_path",
    description: "API endpoint lookup — developer query",
    queryText: "What parameters does the /documents/upload endpoint accept?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: false,
    expectedMinChunks: 1,
    expectedMaxTier: 2,
  },
  {
    id: "A-04",
    category: "happy_path",
    description: "Architecture query for change prep",
    queryText: "How does the document ingestion pipeline work?",
    actionType: "change_prep",
    audience: "internal",
    expectedAbstain: false,
    expectedMinChunks: 1,
    expectedMaxTier: 2,
  },
  {
    id: "A-05",
    category: "happy_path",
    description: "Multi-keyword feature query",
    queryText: "What file formats does the system support for ingestion?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: false,
    expectedMinChunks: 1,
  },
  {
    id: "A-06",
    category: "happy_path",
    description: "Deployment procedure — internal operator",
    queryText: "What are the steps to deploy a new version?",
    actionType: "change_prep",
    audience: "internal",
    expectedAbstain: false,
    expectedMinChunks: 1,
    expectedMaxTier: 2,
  },
  {
    id: "A-07",
    category: "happy_path",
    description: "Simple FAQ — product pricing",
    queryText: "What pricing plans are available?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: false,
    expectedMinChunks: 1,
  },
  {
    id: "A-08",
    category: "happy_path",
    description: "PR draft prep — code change context",
    queryText: "What are the current rate limits for the embedding API?",
    actionType: "pr_draft_prep",
    audience: "internal",
    expectedAbstain: false,
    expectedMinChunks: 1,
  },

  // ── B. Freshness Degradation ──────────────────────────────────────────────
  // These cases are simulated by ingesting with old sourceUpdatedAt dates.
  // The evaluator marks them as expected-abstain and validates the reason.

  {
    id: "B-01",
    category: "freshness",
    description: "Stale T1 FAQ — 100+ days old, auto_reply should abstain",
    queryText: "What is the maximum document size for upload?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: true,
    expectedAbstainReason: "stale_evidence",
  },
  {
    id: "B-02",
    category: "freshness",
    description: "Stale T1 for outage_routing — should abstain",
    queryText: "How do I route an active outage ticket to the right team?",
    actionType: "outage_routing",
    audience: "internal",
    expectedAbstain: true,
    expectedAbstainReason: "stale_evidence",
  },
  {
    id: "B-03",
    category: "freshness",
    description: "Stale T2 — triage does NOT abstain (triage allows degraded)",
    queryText: "What microservices are part of the ingestion subsystem?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: false,
  },

  // ── C. Tier Gate ─────────────────────────────────────────────────────────
  // Product has only T3/T4 data for this topic.

  {
    id: "C-01",
    category: "tier_gate",
    description: "auto_reply with only T4 data — should abstain (insufficient_tier)",
    queryText: "What was the commit message for the last authentication refactor?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: true,
    expectedAbstainReason: "insufficient_tier",
  },
  {
    id: "C-02",
    category: "tier_gate",
    description: "outage_routing with only T3 data — should abstain",
    queryText: "What GitHub issue was filed for the last auth outage?",
    actionType: "outage_routing",
    audience: "internal",
    expectedAbstain: true,
    expectedAbstainReason: "insufficient_tier",
  },
  {
    id: "C-03",
    category: "tier_gate",
    description: "triage with T3 data — should NOT abstain (T2 gate for triage)",
    queryText: "Were there any GitHub issues about PDF parsing failures?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: false,
  },

  // ── D. Conflict Detection ─────────────────────────────────────────────────
  // Requires two contradictory T1/T2 chunks to have been ingested.

  {
    id: "D-01",
    category: "conflict",
    description: "Conflicting T1 chunks in evidence pack — should abstain",
    queryText: "What is the default session timeout duration?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: true,
    expectedAbstainReason: "knowledge_conflict",
  },
  {
    id: "D-02",
    category: "conflict",
    description: "Conflicting T2 chunks — triage should still abstain on conflict",
    queryText: "What are the retry limits for the webhook delivery system?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: true,
    expectedAbstainReason: "knowledge_conflict",
  },

  // ── E. Audience Gate ─────────────────────────────────────────────────────
  // Query audience = public, but only internal chunks cover this topic.

  {
    id: "E-01",
    category: "audience",
    description: "Public query, only internal runbook available — audience_violation abstain",
    queryText: "How does the on-call rotation work?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: true,
    expectedAbstainReason: "audience_violation",
  },
  {
    id: "E-02",
    category: "audience",
    description: "Internal query, only internal data — should NOT abstain",
    queryText: "What is the procedure for rotating database credentials?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: false,
  },

  // ── F. Empty / Sparse Corpus ─────────────────────────────────────────────

  {
    id: "F-01",
    category: "empty_corpus",
    description: "Query on product with zero chunks — no_results abstain",
    queryText: "What features does this product have?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: true,
    expectedAbstainReason: "no_results",
  },
  {
    id: "F-02",
    category: "empty_corpus",
    description: "Query against product with only T4 data on unrelated topic",
    queryText: "How do I configure SSO with SAML?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: true,
  },

  // ── Additional Happy Path — coverage depth ─────────────────────────────────

  {
    id: "A-09",
    category: "happy_path",
    description: "Changelog lookup",
    queryText: "What changed in version 2.1?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: false,
    expectedMinChunks: 1,
  },
  {
    id: "A-10",
    category: "happy_path",
    description: "Troubleshooting guide — specific error",
    queryText: "How do I fix the 'disk quota exceeded' error?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: false,
    expectedMinChunks: 1,
  },
  {
    id: "A-11",
    category: "happy_path",
    description: "Code chunk retrieval — looking for API usage example",
    queryText: "Show me an example of how to call the search API",
    actionType: "pr_draft_prep",
    audience: "internal",
    expectedAbstain: false,
  },
  {
    id: "A-12",
    category: "happy_path",
    description: "Multi-doc synthesis — feature limits",
    queryText: "What are all the limits and quotas in the system?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: false,
    expectedMinChunks: 2,
  },

  // ── Freshness boundary cases ───────────────────────────────────────────────

  {
    id: "B-04",
    category: "freshness",
    description: "T1 at exactly 45-day freshness (0.5 score) — warn but not abstain",
    queryText: "What is the supported authentication method?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: false,   // 0.5 freshness is above 0.3 threshold
    expectedMinFreshness: 0.3,
  },
  {
    id: "B-05",
    category: "freshness",
    description: "T2 stale (200+ days) — auto_reply should still work if T1 fresh",
    queryText: "What is the architecture of the background job system?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: false,
  },

  // ── Tier ranking validation ────────────────────────────────────────────────

  {
    id: "A-13",
    category: "happy_path",
    description: "When T1 and T3 both match, T1 should rank higher",
    queryText: "How is user data protected?",
    actionType: "auto_reply",
    audience: "public",
    expectedAbstain: false,
    expectedMaxTier: 1,  // top chunk should be T1
  },
  {
    id: "A-14",
    category: "happy_path",
    description: "OpenAPI endpoint chunk retrieval",
    queryText: "What does the POST /auth/token endpoint return?",
    actionType: "triage",
    audience: "internal",
    expectedAbstain: false,
    expectedMaxTier: 2,
  },

  // ── Change prep with version sensitivity ──────────────────────────────────

  {
    id: "A-15",
    category: "happy_path",
    description: "Version-filtered retrieval — only v2.x docs",
    queryText: "What are the database schema changes in v2?",
    actionType: "change_prep",
    audience: "internal",
    expectedAbstain: false,
    expectedMinChunks: 1,
  },
]

/** Total evaluation cases count (exported for runner validation). */
export const EVAL_CASE_COUNT = EVAL_DATASET.length
