/**
 * Seed: inserts 8 known-issue / FAQ memory chunks for the DocuGardener pilot product.
 *
 * Purpose: the `known_issue_match` agent abstains (capability_disabled=true) when no
 * tier ≤ 2 chunks exist for the product.  This script seeds the minimum viable set.
 *
 * Usage:
 *   npx tsx --env-file .env scripts/seed-known-issues.ts
 */

import { getDb, closeDb } from "../src/infra/db/client.js"
import { embedText } from "../src/memory/ingestion/embedder.js"
import crypto from "node:crypto"

const PRODUCT_ID = "prod_01kkyb2x4444sj4px80v3253ha"
const NOW = new Date()

interface ChunkDef {
  chunk_id: string
  source_type: string
  tier: number
  source_uri: string
  section_path: string
  content: string
}

const chunks: ChunkDef[] = [
  {
    chunk_id: "mc_known_export-timeout",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://known-issues/export-timeout",
    section_path: "Known Issues > Export > Timeout on Large Document Sets",
    content: `Export timeout on large document sets is a known bug in DocuGardener affecting workspaces with more than 50 documents queued for simultaneous export. When a user triggers a bulk export exceeding this limit, the request times out after 30 seconds and returns HTTP 504. The root cause is an unoptimised sequential PDF rendering pipeline that does not stream results back to the client.

Workaround: Split the export into batches of maximum 50 documents. Use the "Select All" checkbox with the shift-click range selector to pick a subset, then trigger export. Repeat for the next batch. A fix with async job-based export is tracked in ISSUE-441 and is scheduled for v2.5. In the meantime, consider using the CSV manifest export as a lightweight alternative when the full PDF export is not strictly required.`,
  },
  {
    chunk_id: "mc_known_auth-session-expiry",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://known-issues/auth-session-expiry",
    section_path: "Known Issues > Authentication > Session Expiry After Password Reset",
    content: `Authentication session expiry after password reset is a confirmed bug in DocuGardener v2.2 and earlier. When a user resets their password via the forgot-password flow, their existing active sessions are correctly invalidated server-side; however, the client-side JWT stored in the browser's localStorage is not cleared. On the next page navigation the stale token triggers a 401 Unauthorised response, and the app displays a generic "Something went wrong" error rather than redirecting to the login screen.

Resolution: Clear the browser cache and all site data for the DocuGardener domain, then log in again with the new password. In Chrome: Settings > Privacy and security > Clear browsing data > select "Cookies and other site data" > Clear data. This issue is fixed in v2.3 (ISSUE-389). Users on older versions should upgrade or apply the workaround above.`,
  },
  {
    chunk_id: "mc_known_sso-okta-guide",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://known-issues/sso-okta-guide",
    section_path: "FAQ > Authentication > SSO / Okta Configuration Guide",
    content: `Setting up SSO with Okta for DocuGardener requires the following steps:

1. In your Okta Admin Console, create a new SAML 2.0 application. Set the Single Sign-On URL to https://<your-domain>/auth/saml/callback and the Audience URI (SP Entity ID) to https://<your-domain>/auth/saml/metadata.
2. Download the Okta Identity Provider metadata XML from the app's Sign On tab.
3. In DocuGardener, navigate to Settings > Security > SSO Configuration. Upload the Okta metadata XML and save.
4. Under Attribute Statements in Okta, map email to user.email and displayName to user.displayName. These attributes are required.
5. Assign the DocuGardener app to the relevant Okta groups or individual users.
6. Test the login flow by clicking "Test SSO" in DocuGardener Settings. A successful handshake will display the authenticated user's email.

Common pitfalls: clock skew between your IdP and DocuGardener servers causes assertion validation failures — ensure NTP is synchronised. If you see "Invalid assertion signature", re-download the metadata after rotating the Okta signing certificate.`,
  },
  {
    chunk_id: "mc_known_dashboard-slow-load",
    source_type: "known_issues",
    tier: 2,
    source_uri: "internal://known-issues/dashboard-slow-load",
    section_path: "Known Issues > Performance > Dashboard Slow Load with Large Workspaces",
    content: `Dashboard slow load times (>5 seconds) have been reported for workspaces containing more than 2,000 documents. The root cause is an N+1 query in the workspace overview controller that fetches document metadata individually rather than in a batched join. This results in hundreds of sequential database round-trips on initial page load.

The issue is tracked in ISSUE-402 and a query optimisation rewrite is in progress, targeted for v2.4. In the meantime, the following mitigations reduce perceived load time: (1) Enable browser-level caching — DocuGardener sets Cache-Control headers correctly in v2.2+. (2) Use the workspace search page instead of the overview for day-to-day navigation. (3) Archived documents can be moved to a separate workspace to reduce the active document count. Performance benchmarks show the fix in v2.4 reduces load time to under 500ms for workspaces of up to 10,000 documents.`,
  },
  {
    chunk_id: "mc_known_bulk-export-enterprise",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://known-issues/bulk-export-enterprise",
    section_path: "FAQ > Features > Bulk Export — Enterprise Plan",
    content: `Bulk export is available exclusively on the DocuGardener Enterprise plan. It allows exporting up to 10,000 documents in a single asynchronous job, with output formats including ZIP (individual PDFs), merged PDF, and CSV manifest.

How to use bulk export: Navigate to your workspace, select the documents using the checkbox column header for "Select All" or shift-click for a range, then click Actions > Bulk Export. Choose the output format, optionally apply a naming template (e.g. {project_code}_{doc_id}_{date}), and submit. The job is processed in the background; you will receive an email notification with a download link when it is ready. Download links expire after 72 hours.

Starter and Professional plan users see the Bulk Export option greyed out. To upgrade to Enterprise, contact sales@docugardener.io or visit Settings > Billing. Single-document PDF export remains available on all plans without restriction.`,
  },
  {
    chunk_id: "mc_known_migration-integrity",
    source_type: "runbook",
    tier: 1,
    source_uri: "internal://known-issues/migration-integrity",
    section_path: "Runbooks > Data Migration > Script Data Integrity — Common Issues",
    content: `Migration script data integrity checklist for DocuGardener database upgrades:

Pre-migration:
- [ ] Run pg_dump to create a full backup before executing any migration script.
- [ ] Verify row counts in critical tables (documents, workspaces, users) and record them.
- [ ] Confirm disk space: migration may temporarily double storage during index rebuilds.
- [ ] Execute migration in a staging environment first with a production data clone.

During migration:
- [ ] Run scripts inside a transaction (BEGIN / COMMIT) where possible to allow rollback on error.
- [ ] Monitor for lock contention — long-running migrations on documents table may block writes.
- [ ] Check logs for constraint violations; do NOT ignore them.

Post-migration:
- [ ] Re-run row count validation and compare with pre-migration snapshot.
- [ ] Run the built-in integrity check: npx tsx scripts/check-db-integrity.ts
- [ ] Verify foreign-key relationships are intact: no orphaned document_versions or workspace_members rows.
- [ ] Smoke-test critical user flows: login, document create, export.

Common failure: forgetting to migrate document_tags when the documents table is restructured. Always check JOIN tables explicitly.`,
  },
  {
    chunk_id: "mc_known_2fa-setup",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://known-issues/2fa-setup",
    section_path: "FAQ > Security > Two-Factor Authentication Setup",
    content: `Two-factor authentication (2FA) in DocuGardener uses TOTP (Time-based One-Time Password), compatible with authenticator apps such as Google Authenticator, Authy, and 1Password.

How to enable 2FA: Go to Account Settings > Security > Two-Factor Authentication and click Enable. A QR code and backup secret are displayed. Scan the QR code with your authenticator app, then enter the 6-digit code it generates to confirm setup. Save the backup codes shown — these are single-use codes for account recovery if you lose access to your authenticator app.

Organisation-level enforcement: Workspace admins can require 2FA for all members via Settings > Workspace > Security Policy > Require 2FA. Members who have not yet enrolled will be prompted on next login and will have limited access until setup is complete.

Troubleshooting: If the TOTP code is rejected, check that your device clock is accurate (TOTP is time-sensitive). If you lose access to your authenticator app, use a backup code or contact your workspace admin to reset 2FA from the admin panel (Admin > Users > [user] > Reset 2FA).`,
  },
  {
    chunk_id: "mc_known_api-rate-limits",
    source_type: "faq",
    tier: 2,
    source_uri: "internal://known-issues/api-rate-limits",
    section_path: "FAQ > API > Rate Limits and Quotas",
    content: `DocuGardener enforces API rate limits per authentication token to ensure platform stability. Limits are applied on a rolling 60-second window and vary by plan:

Starter plan: 60 requests/minute, 500 requests/day.
Professional plan: 300 requests/minute, 10,000 requests/day.
Enterprise plan: 1,200 requests/minute, no daily cap (fair-use policy applies).

When a limit is exceeded the API returns HTTP 429 Too Many Requests with a Retry-After header indicating the number of seconds to wait before retrying. The X-RateLimit-Remaining and X-RateLimit-Reset headers are included in every response to help clients implement adaptive throttling.

Webhook delivery counts against the same quota as direct API calls. Background integrations (e.g. Zapier, Make) should implement exponential back-off on 429 responses. For bulk operations, use the asynchronous job endpoints (/jobs/*) which are rate-limited separately at 20 job submissions/minute across all plans. Contact support@docugardener.io to request a temporary quota increase for planned migrations or data loads.`,
  },
]

async function main() {
  const db = getDb()

  console.log(`Seeding ${chunks.length} known-issue chunks for product ${PRODUCT_ID}`)

  let inserted = 0
  let skipped = 0

  for (const chunk of chunks) {
    const contentHash = crypto
      .createHash("sha256")
      .update(chunk.content)
      .digest("hex")
      .slice(0, 20)

    // Attempt to generate an embedding; fall back to NULL on any API error
    let embeddingVector: number[] | null = null
    try {
      const result = await embedText(chunk.content)
      embeddingVector = result.embedding
      console.log(`  [embed ok] ${chunk.chunk_id} (${embeddingVector.length} dims)`)
    } catch (err) {
      console.warn(`  [embed fail] ${chunk.chunk_id} — inserting with NULL embedding. Error: ${String(err)}`)
    }

    const embeddingLiteral =
      embeddingVector !== null ? `[${embeddingVector.join(",")}]` : null

    try {
      if (embeddingLiteral !== null) {
        await db`
          INSERT INTO memory_chunks (
            chunk_id, product_id, source_type, tier, source_uri,
            section_path, content_type, content, product_version,
            source_updated_at, freshness_score, audience, language,
            conflict_flag, embedding, content_hash
          ) VALUES (
            ${chunk.chunk_id},
            ${PRODUCT_ID},
            ${chunk.source_type},
            ${chunk.tier},
            ${chunk.source_uri},
            ${chunk.section_path},
            ${"prose"},
            ${chunk.content},
            ${"*"},
            ${NOW},
            ${0.95},
            ${"internal"},
            ${"en"},
            ${false},
            ${embeddingLiteral}::vector,
            ${contentHash}
          )
          ON CONFLICT (product_id, source_uri, section_path, content_hash) DO NOTHING
        `
      } else {
        await db`
          INSERT INTO memory_chunks (
            chunk_id, product_id, source_type, tier, source_uri,
            section_path, content_type, content, product_version,
            source_updated_at, freshness_score, audience, language,
            conflict_flag, content_hash
          ) VALUES (
            ${chunk.chunk_id},
            ${PRODUCT_ID},
            ${chunk.source_type},
            ${chunk.tier},
            ${chunk.source_uri},
            ${chunk.section_path},
            ${"prose"},
            ${chunk.content},
            ${"*"},
            ${NOW},
            ${0.95},
            ${"internal"},
            ${"en"},
            ${false},
            ${contentHash}
          )
          ON CONFLICT (product_id, source_uri, section_path, content_hash) DO NOTHING
        `
      }
      console.log(`  [inserted] ${chunk.chunk_id} (tier ${chunk.tier}, ${chunk.source_type})`)
      inserted++
    } catch (err) {
      // Duplicate chunk_id (PK conflict) means already seeded — treat as skipped
      const msg = String(err)
      if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
        console.log(`  [skipped]  ${chunk.chunk_id} — already exists`)
        skipped++
      } else {
        throw err
      }
    }
  }

  console.log(`\nDone. inserted=${inserted}  skipped=${skipped}`)

  await closeDb()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
