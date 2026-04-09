/**
 * Seed script for local UX testing of:
 *   UX-06 — Escalate to Lead (inline in Change Queue)
 *   UX-09 — Mark Resolved with optional note (in LineageTimeline)
 *
 * Creates:
 *   1. Case "awaiting-lead" with a change request pending approval → tests UX-06 Escalate button
 *   2. Case "triaged" (fully triaged, no CR) → tests UX-09 Mark Resolved modal
 *
 * Usage:
 *   node --env-file .env --import tsx/esm scripts/seed-ux-test.ts
 */

import { getDb } from "../src/infra/db/client.js"
import { newId } from "../src/infra/db/id.js"

const PRODUCT_ID = "prod_01kkyb2x4444sj4px80v3253ha" // DocuGardener
const IDENTITY_ID = "id_01kkyb3e1vkc8vhfpwkng8xszb" // Test User

async function main() {
  const db = getDb()

  // ── Case 1: awaiting-lead + pending-approval change request (for UX-06) ──────
  const case1Id = newId("case_")
  const conv1Id = newId("conv_")
  const cr1Id   = newId("cr_")

  await db`
    INSERT INTO cases (
      case_id, product_id, title, summary, reporter_identity_id,
      conversation_ids, status, type, severity, urgency, confidence,
      signal_text, triage_output
    ) VALUES (
      ${case1Id},
      ${PRODUCT_ID},
      'Export button broken for datasets > 10 000 rows',
      'Multiple users report the export button hangs indefinitely when dataset exceeds 10k rows. No error shown. Affects enterprise tier.',
      ${IDENTITY_ID},
      ${[conv1Id]},
      'in-change',
      'bug_report',
      'high',
      'high',
      0.92,
      'Hey, the export button is not working for large datasets. It just spins forever.',
      ${db.json({
        category: "bug",
        severity: "high",
        urgency: "high",
        confidence: 0.92,
        summary: "Export hangs on large datasets",
        draft_reply: "We have identified an issue with the export pipeline for large datasets. A fix is in progress.",
      })}
    )
  `

  await db`
    INSERT INTO change_requests (
      change_request_id, product_id, case_id, title,
      problem_statement, status, risk_level, cr_track,
      impact_summary, proposed_scope
    ) VALUES (
      ${cr1Id},
      ${PRODUCT_ID},
      ${case1Id},
      'Fix: export timeout for datasets > 10 000 rows',
      'The export endpoint times out after 30 s for large datasets because it loads all rows into memory before streaming.',
      'approval-pending',
      'low',
      'customer_reported',
      'Affects all enterprise customers who export large datasets.',
      'Add server-side streaming to the export endpoint with chunk size 500.'
    )
  `

  console.log(`✓ UX-06 test case: ${case1Id}  (status: in-change)`)
  console.log(`  change_request:   ${cr1Id}    (status: pending-approval)`)

  // ── Case 2: triaged, no CR (for UX-09) ───────────────────────────────────────
  const case2Id = newId("case_")
  const conv2Id = newId("conv_")

  await db`
    INSERT INTO cases (
      case_id, product_id, title, summary, reporter_identity_id,
      conversation_ids, status, type, severity, urgency, confidence,
      signal_text, triage_output, draft_reply
    ) VALUES (
      ${case2Id},
      ${PRODUCT_ID},
      'Login fails with SSO after password reset',
      'User cannot log in via SSO after resetting password. Auth provider shows token mismatch.',
      ${IDENTITY_ID},
      ${[conv2Id]},
      'triaged',
      'bug_report',
      'normal',
      'high',
      0.87,
      'After I reset my password I can no longer log in with Google SSO. It says "token mismatch".',
      ${db.json({
        category: "bug",
        severity: "medium",
        urgency: "high",
        confidence: 0.87,
        summary: "SSO login broken after password reset",
        draft_reply: "This is a known edge case with our SSO provider. Please clear cookies and try again. If the issue persists, contact support.",
      })},
      'This is a known edge case with our SSO provider. Please clear cookies and try again.'
    )
  `

  console.log(`✓ UX-09 test case: ${case2Id}  (status: triaged)`)

  console.log(`\n── Done ──`)
  console.log(`Open console → DocuGardener product to see both cases.`)
  console.log(`  UX-06: Go to Approvals tab → find the pending CR → click Escalate`)
  console.log(`  UX-09: Open the triaged case → click "Mark Resolved" → add optional note`)

  await db.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
