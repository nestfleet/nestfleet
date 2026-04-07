/**
 * Shared types for the Product Memory subsystem.
 * Canonical reference: docs/product-memory-specification.md
 */

// ── Source Classification ──────────────────────────────────────────────────

export type SourceTier = 1 | 2 | 3 | 4

export type SourceType =
  | "product_spec"
  | "feature_spec"
  | "faq"
  | "known_issues"
  | "api_docs"
  | "openapi_spec"
  | "architecture_overview"
  | "technical_spec"
  | "deployment_guide"
  | "troubleshooting_guide"
  | "runbook"
  | "changelog"
  | "github_issue_filtered"  // T3: closed, labeled, linked to merged PR
  | "github_pr_merged"       // T3: merged PR with description
  | "github_issue_raw"       // T4: open, unlabeled
  | "commit_message"         // T4
  | "readme"

export type ContentType = "prose" | "code" | "structured"
export type Audience = "public" | "internal"
export type HealthLevel = "good" | "warn" | "fail"
export type CapabilityStatus = "enabled" | "degraded" | "disabled"

// ── Chunk ─────────────────────────────────────────────────────────────────

export interface Chunk {
  chunkId: string
  productId: string
  sourceType: SourceType
  sourceSubtype?: string
  tier: SourceTier
  sourceUri: string
  sectionPath: string
  contentType: ContentType
  content: string
  productVersion: string    // '*' = version-agnostic
  sourceUpdatedAt: Date
  ingestedAt: Date
  freshnessScore: number    // 0.0–1.0
  audience: Audience
  language: string
  conflictFlag: boolean
  embedding?: number[]
  contentHash: string
}

// ── Evidence Pack ─────────────────────────────────────────────────────────

export interface EvidenceChunk {
  chunkId: string
  sourceType: SourceType
  sourceUri: string
  sectionPath: string
  contentType: ContentType
  content: string
  tier: SourceTier
  freshnessScore: number
  conflictFlag: boolean
  audience: Audience
  score: number             // final retrieval score after reranking
}

export interface EvidencePack {
  chunks: EvidenceChunk[]
  tierSummary: Record<SourceTier, number>   // count per tier
  minFreshness: number
  avgFreshness: number
  hasConflicts: boolean
  abstain: boolean
  abstainReason: AbstainReason | null
}

export type AbstainReason =
  | "insufficient_tier"      // no T1/T2 source in pack for an action requiring T1
  | "stale_evidence"         // all T1/T2 chunks have freshness < 0.3
  | "knowledge_conflict"     // conflicting chunks in evidence pack
  | "capability_disabled"    // health gate says capability is disabled
  | "audience_violation"     // only internal chunks available for an external action
  | "version_unknown"        // query is version-sensitive but no version in signal
  | "no_results"             // retrieval returned nothing

// ── Retrieval Request ─────────────────────────────────────────────────────

export interface RetrievalRequest {
  productId: string
  queryText: string
  queryEmbedding: number[]
  audience: Audience
  productVersion?: string     // undefined = no version filter
  minTier?: SourceTier        // minimum tier gate (1 = T1 only, 4 = any)
  contentTypes?: ContentType[]
  topK?: number               // candidates before reranking (default: 20)
  topN?: number               // final evidence pack size (default: 5)
  actionType?: ActionType     // used to apply correct policy gate
}

export type ActionType =
  | "auto_reply"
  | "triage"
  | "known_issue_match"
  | "change_prep"
  | "pr_draft_prep"
  | "outage_routing"

// ── Documentation Health ──────────────────────────────────────────────────

export interface HealthDimensions {
  t1Coverage: HealthLevel
  faqCoverage: HealthLevel
  knownIssues: HealthLevel
  architecture: HealthLevel
  technicalSpec: HealthLevel
  freshness: HealthLevel
  conflicts: HealthLevel
  language: "good" | "warn"
}

export interface CapabilityGates {
  autoReply: CapabilityStatus
  knownIssueMatch: CapabilityStatus
  changePrep: CapabilityStatus
  prDraft: CapabilityStatus
  outageRouting: CapabilityStatus
}

export interface HealthMetrics {
  t1ChunkCount: number
  t1CoveragePercent: number
  faqEntryCount: number
  knownIssueCount: number
  architecturePresent: boolean
  architectureFresh: boolean
  technicalSpecPresent: boolean
  technicalSpecFresh: boolean
  freshT1Percent: number      // % of T1 chunks with freshness >= 0.5
  openConflictCount: number
  primaryLanguage: string
  totalChunks: number
}

export interface DocumentationHealthReport {
  reportId: string
  productId: string
  computedAt: Date
  dimensions: HealthDimensions
  capabilities: CapabilityGates
  metrics: HealthMetrics
  recommendedActions: string[]
}

// ── Knowledge Conflict ────────────────────────────────────────────────────

export interface KnowledgeConflict {
  conflictId: string
  productId: string
  chunkIdA: string
  chunkIdB: string
  conflictSummary: string
  detectedAt: Date
  status: "open" | "resolved" | "dismissed"
}
