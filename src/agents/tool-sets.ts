// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * TOOL_SETS_BY_ACTION_TYPE — compile-time constant mapping action types to tool sets.
 * AE-03 / ADR-024: static tool sets per action type, no runtime registration.
 *
 * Tools are instantiated with productId at dispatch time.
 * All tools are read-only — no tool writes to the database.
 * If an action type is not in this map, dispatch is rejected before LLM is called.
 *
 * Tool sets by action type:
 *   auto_reply:        lookupFaq, lookupKnownIssue
 *   triage:            lookupKnownIssue, lookupSeverityPolicy
 *   known_issue_match: lookupKnownIssue, searchSimilarCases
 *   change_prep:       lookupSpec, lookupArchitecture, lookupChangelog
 *   pr_draft_prep:     lookupChangeRequest, lookupGithubContext, lookupSpec
 *   outage_routing:    lookupRunbook, lookupTeamRouting, lookupKnownIssue
 */

import type { ToolSet } from "ai"
import type { ActionType } from "./types.js"
import { lookupFaq } from "./tools/lookup-faq.js"
import { lookupKnownIssue } from "./tools/lookup-known-issue.js"
import { lookupSeverityPolicy } from "./tools/lookup-severity-policy.js"
import { searchSimilarCases } from "./tools/search-similar-cases.js"
import { lookupSpec } from "./tools/lookup-spec.js"
import { lookupArchitecture } from "./tools/lookup-architecture.js"
import { lookupChangelog } from "./tools/lookup-changelog.js"
import { lookupChangeRequest } from "./tools/lookup-change-request.js"
import { lookupGithubContext } from "./tools/lookup-github-context.js"
import { lookupRunbook } from "./tools/lookup-runbook.js"
import { lookupTeamRouting } from "./tools/lookup-team-routing.js"

/**
 * Factory: build the tool set for a given action type, bound to a specific product.
 * The productId is injected into every tool's execute closure — it is NEVER passed
 * in the job payload and never taken from LLM output. ADR-024.
 *
 * @param actionType  The action type being dispatched
 * @param productId   The authoritative product ID from the case record (worker-owned)
 * @returns           The tool set for this action type, or null if action type not in registry
 */
export function getToolSet(actionType: ActionType, productId: string): ToolSet | null {
  switch (actionType) {
    case "auto_reply":
      return {
        lookupFaq: lookupFaq(productId),
        lookupKnownIssue: lookupKnownIssue(productId),
      }

    case "triage":
      return {
        lookupKnownIssue: lookupKnownIssue(productId),
        lookupSeverityPolicy: lookupSeverityPolicy(productId),
      }

    case "known_issue_match":
      return {
        lookupKnownIssue: lookupKnownIssue(productId),
        searchSimilarCases: searchSimilarCases(productId),
      }

    case "change_prep":
      return {
        lookupSpec: lookupSpec(productId),
        lookupArchitecture: lookupArchitecture(productId),
        lookupChangelog: lookupChangelog(productId),
      }

    case "pr_draft_prep":
      return {
        lookupChangeRequest: lookupChangeRequest(productId),
        lookupGithubContext: lookupGithubContext(productId),
        lookupSpec: lookupSpec(productId),
      }

    case "outage_routing":
      return {
        lookupRunbook: lookupRunbook(productId),
        lookupTeamRouting: lookupTeamRouting(productId),
        lookupKnownIssue: lookupKnownIssue(productId),
      }

    case "knowledge_capture":
      // Reads resolved cases and similar historical context to extract
      // FAQ entries and runbook patterns. Growth+ only (§6.3.4).
      return {
        lookupFaq: lookupFaq(productId),
        searchSimilarCases: searchSimilarCases(productId),
        lookupKnownIssue: lookupKnownIssue(productId),
      }

    default: {
      const _exhaustive: never = actionType
      return null
    }
  }
}
