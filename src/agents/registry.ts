/**
 * AGENT_REGISTRY — single source of truth for per-action-type agent configuration. QE-01.
 *
 * Merges four previously-parallel maps into one typed registry:
 *   - llm-provider.ts ACTION_TIERS     (modelTier)
 *   - tool-sets.ts comments            (tools)
 *   - types.ts TOKEN_BUDGETS           (tokenBudget)
 *   - run-agent.ts TIMEOUTS_MS         (timeoutMs)
 *
 * System prompts and Zod schemas remain in their agent impl files — this registry
 * is configuration only. Agents and workers use getAgentDefinition() for lookups.
 *
 * NOTE: This registry is read-only configuration. The authoritative runtime
 * lookups (getLlmProviderForProduct, getToolSet, TOKEN_BUDGETS, TIMEOUTS_MS)
 * remain in their respective modules so nothing breaks in the existing call graph.
 * The registry is additive — reducing duplication for introspection and testing.
 */

import type { ActionType } from "./types.js"

// ── Tool names ────────────────────────────────────────────────────────────────

/** Tool names available to agents. Keys match the exported factory names in tool-sets.ts. */
export type ToolName =
  | "lookupFaq"
  | "lookupKnownIssue"
  | "lookupSeverityPolicy"
  | "searchSimilarCases"
  | "lookupSpec"
  | "lookupArchitecture"
  | "lookupChangelog"
  | "lookupChangeRequest"
  | "lookupGithubContext"
  | "lookupRunbook"
  | "lookupTeamRouting"

// ── Agent definition ──────────────────────────────────────────────────────────

/** Model tier mapping (mirrors ACTION_TIERS in llm-provider.ts). */
export type ModelTier = "fast" | "standard" | "complex"

/** Token budget for one agent call (mirrors TokenBudget in types.ts). */
export interface AgentTokenBudget {
  /** Phase 1 (tool-calling) input token limit. */
  phase1MaxInput: number
  /** Phase 1 output token limit. */
  phase1MaxOutput: number
  /** Phase 2 (structured extraction) input token limit. */
  phase2MaxInput: number
  /** Phase 2 output token limit. */
  phase2MaxOutput: number
}

/** Phasing strategy label. */
export type PhasingStrategy = "single-phase" | "two-phase"

/** Per-action-type agent configuration. */
export interface AgentDefinition {
  /** Model tier used for provider selection (fast/standard/complex). */
  modelTier: ModelTier
  /** Tool names available to this agent during inference. */
  tools: readonly ToolName[]
  /** Token budget per phase. */
  tokenBudget: AgentTokenBudget
  /** Wall-clock timeout in ms (P95 SLO from phase2-agentic-engine-design.md §7). */
  timeoutMs: number
  /** Execution strategy in runAgent() (single vs two-phase). */
  strategy: PhasingStrategy
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const AGENT_REGISTRY: Readonly<Record<ActionType, AgentDefinition>> = {
  // ── fast / single-phase ──────────────────────────────────────────────────
  triage: {
    modelTier: "fast",
    tools: ["lookupKnownIssue", "lookupSeverityPolicy"],
    tokenBudget: {
      phase1MaxInput:  6_000, phase1MaxOutput: 1_500,
      phase2MaxInput:  8_000, phase2MaxOutput: 1_500,
    },
    timeoutMs: 90_000,
    strategy: "single-phase",
  },

  // ── standard / single-phase ──────────────────────────────────────────────
  auto_reply: {
    modelTier: "standard",
    tools: ["lookupFaq", "lookupKnownIssue"],
    tokenBudget: {
      phase1MaxInput:  8_000, phase1MaxOutput:  3_000,
      phase2MaxInput: 12_000, phase2MaxOutput:  3_000,
    },
    timeoutMs: 25_000,
    strategy: "single-phase",
  },

  // ── fast / two-phase ─────────────────────────────────────────────────────
  known_issue_match: {
    modelTier: "fast",
    tools: ["lookupKnownIssue", "searchSimilarCases"],
    tokenBudget: {
      phase1MaxInput:  5_000, phase1MaxOutput:   600,
      phase2MaxInput:  8_000, phase2MaxOutput:   600,
    },
    timeoutMs: 20_000,
    strategy: "two-phase",
  },

  outage_routing: {
    modelTier: "fast",
    tools: ["lookupRunbook", "lookupTeamRouting", "lookupKnownIssue"],
    tokenBudget: {
      phase1MaxInput:  6_000, phase1MaxOutput:   800,
      phase2MaxInput: 10_000, phase2MaxOutput:   800,
    },
    timeoutMs: 15_000,
    strategy: "two-phase",
  },

  // ── complex / two-phase ──────────────────────────────────────────────────
  change_prep: {
    modelTier: "complex",
    tools: ["lookupSpec", "lookupArchitecture", "lookupChangelog"],
    tokenBudget: {
      phase1MaxInput: 10_000, phase1MaxOutput: 2_000,
      phase2MaxInput: 18_000, phase2MaxOutput: 2_000,
    },
    timeoutMs: 60_000,
    strategy: "two-phase",
  },

  pr_draft_prep: {
    modelTier: "complex",
    tools: ["lookupChangeRequest", "lookupGithubContext", "lookupSpec"],
    tokenBudget: {
      phase1MaxInput: 12_000, phase1MaxOutput: 3_000,
      phase2MaxInput: 20_000, phase2MaxOutput: 3_000,
    },
    timeoutMs: 90_000,
    strategy: "two-phase",
  },

  // ── standard / single-phase ──────────────────────────────────────────────
  knowledge_capture: {
    modelTier: "standard",
    tools: ["lookupFaq", "searchSimilarCases", "lookupKnownIssue"],
    tokenBudget: {
      phase1MaxInput:  8_000, phase1MaxOutput: 1_500,
      phase2MaxInput: 12_000, phase2MaxOutput: 1_500,
    },
    timeoutMs: 30_000,
    strategy: "single-phase",
  },
} as const

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Return the AgentDefinition for the given action type.
 * Type-safe: TypeScript ensures actionType is a valid ActionType at the call site.
 */
export function getAgentDefinition(actionType: ActionType): AgentDefinition {
  return AGENT_REGISTRY[actionType]
}
