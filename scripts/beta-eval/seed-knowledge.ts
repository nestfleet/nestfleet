/**
 * Beta Evaluation — Knowledge Base Seed Script
 *
 * Seeds 16 KB articles (7 DocuGardener + 9 SkillSeal) as memory chunks
 * with embeddings. These articles power the frontline AI's known-issue
 * matching and KB response drafting during the evaluation scenarios.
 *
 * Usage:
 *   npx tsx --env-file .env scripts/beta-eval/seed-knowledge.ts
 *   npx tsx --env-file .env scripts/beta-eval/seed-knowledge.ts --product dg
 *   npx tsx --env-file .env scripts/beta-eval/seed-knowledge.ts --product ss
 *   npx tsx --env-file .env scripts/beta-eval/seed-knowledge.ts --dry-run
 */

import { getDb, closeDb } from "../../src/infra/db/client.js"
import { embedText } from "../../src/memory/ingestion/embedder.js"
import crypto from "node:crypto"

// ── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(): { product: "all" | "dg" | "ss"; dryRun: boolean } {
  const args = process.argv.slice(2)
  let product: "all" | "dg" | "ss" = "all"
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--product" && args[i + 1]) {
      const val = args[++i]!.toLowerCase()
      if (val === "dg" || val === "ss") product = val
      else { console.error(`Unknown product: ${val}. Use "dg" or "ss".`); process.exit(1) }
    } else if (arg === "--dry-run") {
      dryRun = true
    }
  }
  return { product, dryRun }
}

// ── Chunk definitions ───────────────────────────────────────────────────────

interface ChunkDef {
  chunk_id: string
  product_slug: "dg" | "ss"
  source_type: string
  tier: number
  source_uri: string
  section_path: string
  content: string
}

const chunks: ChunkDef[] = [
  // ── DocuGardener (7) ────────────────────────────────────────────────────
  {
    chunk_id: "mc_beta_dg_docuignore",
    product_slug: "dg",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/dg-docuignore",
    section_path: "FAQ > Configuration > Configuring .docuignore",
    content: `DocuGardener's drift detection can be controlled at multiple levels to avoid false positives on internal-only changes:

1. **.docuignore file** — placed at the repo root. Supports glob patterns like node_modules/**, internal/**, and specific file exclusions like src/services/PaymentProcessor.ts. Any file matching a pattern is excluded from drift scoring entirely.

2. **Inline annotation** — add \`# dg-ignore\` as a comment on any line of code. DocuGardener skips that line during diff analysis. Useful for struct/class renames that don't affect public APIs.

3. **.docugardener.yml ignore section** — under the \`ignore:\` key, list paths or patterns to exclude from the current repo's drift checks. This takes precedence over .docuignore when both exist.

4. **scoring.internalOnly: ignore** — in .docugardener.yml, setting \`scoring.internalOnly: ignore\` tells the blast radius calculator to skip any symbol that is not referenced in public-facing documentation (e.g. docs/api/*, README.md).

Best practice for internal refactoring PRs: combine .docuignore for file-level exclusions with \`scoring.internalOnly: ignore\` for symbol-level filtering. This reduces false positive drift scores from >0.8 to near-zero for internal-only renames.`,
  },
  {
    chunk_id: "mc_beta_dg_blast_radius",
    product_slug: "dg",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/dg-blast-radius",
    section_path: "Known Issues > Drift Detection > Blast Radius Scoring",
    content: `DocuGardener's blast radius scoring determines the impact of code changes on documentation freshness. The drift score (0.0–1.0) is computed from:

- **Symbol coverage**: ratio of changed symbols referenced in docs vs total changed symbols
- **Audience reach**: public API docs score higher than internal architecture docs
- **Staleness**: docs last updated >90 days ago get a 0.15 boost to drift score
- **Cascading refs**: if a renamed symbol appears in 3+ doc files, score gets a multiplicative 1.3x factor

Scores above 0.7 trigger a PR merge block. Scores 0.4–0.7 produce a warning comment. Below 0.4 is informational only.

To override a false-positive block: add \`[dg-override]\` to the PR description body. This converts the block to a warning and logs the override for audit. Only users with the "Documentation Lead" role can use this override.

Known limitation: internal struct renames (e.g. PaymentProcessor → PaymentEngine) can produce high drift scores if the old name appears in architecture.md even if it's never mentioned in user-facing docs. Resolution: use \`scoring.internalOnly: ignore\` in .docugardener.yml or add the renamed file to .docuignore.`,
  },
  {
    chunk_id: "mc_beta_dg_nightly_rollup",
    product_slug: "dg",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/dg-nightly-rollup",
    section_path: "FAQ > Configuration > Nightly Rollup Configuration",
    content: `DocuGardener's nightly rollup consolidates multiple drift detections from the day into a single summary issue, reducing notification noise.

Configuration in .docugardener.yml:
\`\`\`yaml
rollup:
  consolidate: true         # Enable nightly consolidation (default: false)
  minDriftScore: 0.4        # Only include detections with score >= threshold
  schedule: "0 6 * * *"     # Cron schedule (UTC). Default: 6:00 AM UTC
  maxIssuesPerRun: 5        # Cap to avoid issue flood (default: 10)
  groupBy: "repo"           # Group by repo (default) or "file"
\`\`\`

Per-repo overrides: add the same block under a specific repo's config section to override global settings. For example, a high-traffic monorepo might use \`maxIssuesPerRun: 3\` while smaller repos use the global default.

When \`consolidate: false\` (default), each drift detection creates an individual issue immediately when detected. This is simpler but creates 8+ issues for active repos, which overwhelms notification channels.

Troubleshooting: If the rollup creates too many issues, increase \`minDriftScore\` to filter out low-impact detections. If important drift is missed, lower the threshold. The recommended starting point is 0.4 for active repos.`,
  },
  {
    chunk_id: "mc_beta_dg_embedding_refresh",
    product_slug: "dg",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/dg-embedding-refresh",
    section_path: "Known Issues > RAG > Embedding Refresh Triggers",
    content: `DocuGardener's RAG pipeline uses embeddings to compare code symbols against documentation content. Embeddings are refreshed under these conditions:

1. **Push to default branch** — automatic re-index of changed files within 5 minutes of merge.
2. **Manual re-index** — run \`dg reindex --branch main\` from the CLI. Processes all files, not just changed ones. Takes 10-30 minutes depending on repo size.
3. **Stale detection** — if an embedding was generated >30 days ago and the source file has changed since, it's flagged for automatic refresh in the next nightly cycle.

Known issue: When DocuGardener's embedding model is updated (e.g. from v2 to v3), existing embeddings are NOT automatically re-generated. This causes cosine similarity scores to be unreliable because old and new embeddings are not comparable. Symptoms: drift scores either always near 1.0 or always near 0.0.

Resolution: After a model update, run a full re-index: \`dg reindex --branch main --force\`. The \`--force\` flag regenerates all embeddings regardless of staleness.

Known limitation: Private repos behind corporate firewalls may fail the automatic refresh if the DocuGardener GitHub App cannot reach the repo. Check the Integration Health page in Settings for connectivity errors.`,
  },
  {
    chunk_id: "mc_beta_dg_billing",
    product_slug: "dg",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/dg-billing",
    section_path: "FAQ > Billing > Upgrade Billing Policy",
    content: `DocuGardener uses Stripe for subscription management. Billing policy for upgrades:

- **Pro-rata credits**: When upgrading mid-cycle (e.g. Solo → Team on day 15 of a 30-day cycle), you receive a pro-rata credit for the unused portion of the current plan. The credit is applied immediately to the first charge of the new plan.
- **Expected charge**: New plan price minus pro-rata credit. Example: Solo at $29/mo, upgrading to Team at $79/mo on day 15 → credit = $14.50, first charge = $79 - $14.50 = $64.50. Subsequent months charge the full $79.
- **Downgrade**: Takes effect at the end of the current billing cycle. No pro-rata refund for the current month.
- **Refund policy**: Contact support@docugardener.io within 14 days of an unintended charge for a full refund. After 14 days, only pro-rata credits for future months are available.

Troubleshooting: If the first charge after upgrade appears higher than expected, check the Stripe invoice in Settings > Billing > Invoice History. The invoice shows the line-item breakdown: credit, new plan charge, and any applicable taxes.`,
  },
  {
    chunk_id: "mc_beta_dg_ghe_oauth",
    product_slug: "dg",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/dg-ghe-oauth",
    section_path: "FAQ > Integration > GitHub Enterprise Server OAuth Scopes",
    content: `Connecting DocuGardener to GitHub Enterprise Server (GHE) requires the following OAuth scopes:

Required scopes:
- \`repo\` — full control of private repositories (needed for drift detection and PR comments)
- \`read:org\` — read access to organization membership (for team-based repo filtering)
- \`admin:repo_hook\` — manage repository webhooks (DocuGardener creates a webhook per connected repo)

NOT required: \`site_admin\` — this scope is for GHE server administrators and is NOT needed by DocuGardener.

Setup steps:
1. In your GHE instance: Settings > Developer settings > OAuth Apps > New OAuth App
2. Set Authorization callback URL to: \`https://app.docugardener.io/auth/github/callback\`
3. For self-hosted DocuGardener: use your instance URL instead
4. Copy the Client ID and Client Secret to DocuGardener: Settings > Integrations > GitHub Enterprise
5. Enter your GHE instance URL (e.g. \`https://github.yourcompany.com\`)
6. Click "Test Connection" — this verifies the scopes and connectivity

Troubleshooting "insufficient scope" error:
- This occurs when the OAuth token was created with fewer scopes than required. Solution: revoke the existing token in GHE (Settings > Applications > Authorized OAuth Apps > DocuGardener > Revoke), then re-authorize from DocuGardener's integration settings. This forces a new token with the correct scopes.
- Common cause: the OAuth app was initially set up with only \`read:org\` and \`repo\` but missing \`admin:repo_hook\`.`,
  },
  {
    chunk_id: "mc_beta_dg_ai_author",
    product_slug: "dg",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/dg-ai-author",
    section_path: "FAQ > Features > AI Author Mode Safety Controls",
    content: `DocuGardener's AI Author Mode can automatically generate documentation updates and create PRs. Safety controls prevent unintended merges:

Auto-merge criteria (all must be true):
1. The generated PR has 0 diff conflicts with the target branch
2. All CI checks pass (if configured)
3. The documentation change affects only files within the configured docs directory (default: docs/**)
4. The generated content passes link validation — no broken links introduced
5. The PR has been open for at least the configured review window (default: 24 hours)
6. No human has left a review comment requesting changes

Link validation pre-merge:
- DocuGardener checks all URLs in the generated content. Broken links (HTTP 404, timeout >10s) block auto-merge.
- Internal cross-references (e.g. ../api/signals.md) are validated against the repo file tree.

Disabling auto-merge per repo:
- In .docugardener.yml: \`aiAuthor.autoMerge: false\`
- Or globally: Dashboard > Settings > AI Author > Disable Auto-Merge
- When disabled, AI Author creates PRs but never merges them. A human must merge manually.

Security: AI Author never modifies code files, only documentation. The scope is enforced by a path whitelist in the GitHub App's repository permissions.`,
  },

  // ── SkillSeal (9) ───────────────────────────────────────────────────────
  {
    chunk_id: "mc_beta_ss_claim_pipeline",
    product_slug: "ss",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/ss-claim-pipeline",
    section_path: "FAQ > Credentials > Credential Claim to Vault Pipeline",
    content: `The SkillSeal credential claim flow for new users:

1. **Email notification** — User receives "Your credential is ready to claim" email with a unique claim link
2. **Identity confirmation** — User clicks link → lands on claim page → confirms identity (email + name match)
3. **Smart Account deployment** — If the user doesn't have a wallet, SkillSeal deploys an ERC-4337 Smart Account (gasless, no seed phrase needed). Takes 10-30 seconds on Base L2.
4. **Credential mint** — The verifiable credential is minted as a Soulbound Token (non-transferable ERC-721) to the user's Smart Account. Minting is queued in BullMQ and processed sequentially.
5. **Vault display** — The credential appears in the user's Vault within 30 seconds to 2 minutes of mint confirmation.

Common delays:
- Smart Account deployment can take up to 2 minutes during Base L2 congestion
- BullMQ queue backlog: if >100 credentials are being minted simultaneously, individual mints queue behind each other (FIFO)
- Redis memory pressure: if Redis memory exceeds 80%, the BullMQ worker pauses and credentials appear "stuck"

If a credential doesn't appear after 5 minutes: check the admin dashboard > Queue Health page. Look for stuck jobs (status: "waiting" with age >5 min). Manual retry: Admin API \`POST /admin/queues/credential-mint/retry-all\`.`,
  },
  {
    chunk_id: "mc_beta_ss_bullmq_troubleshooting",
    product_slug: "ss",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/ss-bullmq-troubleshooting",
    section_path: "Known Issues > Infrastructure > BullMQ Queue Troubleshooting",
    content: `SkillSeal uses BullMQ (Redis-backed) for asynchronous credential operations: minting, verification, and proof generation.

Checking queue health:
- Redis CLI: \`LLEN bull:credential-mint:wait\` — shows number of pending jobs
- Admin API: \`GET /admin/queues/credential-mint/stats\` — returns waiting, active, completed, failed counts
- Dashboard: Admin > Queue Health — visual queue depth graph

Common failure modes:
1. **Redis memory pressure** — when used_memory exceeds maxmemory (default 256MB), Redis evicts keys and BullMQ jobs can be lost. Monitor with \`INFO memory\`. Fix: increase maxmemory or drain completed jobs.
2. **Worker crash loop** — if the credential-mint worker throws unhandled errors, it enters a crash-restart loop. Jobs pile up. Check: \`pm2 logs credential-mint-worker\` for stack traces.
3. **Stale jobs** — jobs stuck in "active" state for >5 minutes usually indicate the worker died mid-processing. Recovery: \`POST /admin/queues/credential-mint/clean?status=stalled\` to move stalled jobs back to waiting.

Manual retry:
- Single job: \`POST /admin/queues/credential-mint/jobs/:jobId/retry\`
- All failed: \`POST /admin/queues/credential-mint/retry-all\`
- All stalled: \`POST /admin/queues/credential-mint/clean?status=stalled\``,
  },
  {
    chunk_id: "mc_beta_ss_webhook_changelog",
    product_slug: "ss",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/ss-webhook-changelog",
    section_path: "Known Issues > API > Webhook Payload Changelog v2.0.x → v2.1.0",
    content: `SkillSeal webhook payload breaking changes in v2.1.0:

v2.0.x payload (credential.issued event):
\`\`\`json
{
  "event": "credential.issued",
  "credentialId": "cred_abc123",
  "talentDid": "did:pkh:eip155:8453:0x...",
  "issuerDid": "did:web:example.edu",
  "issuedAt": "2026-03-15T10:00:00Z",
  "schemaId": "schema_skill_v2"
}
\`\`\`

v2.1.0 payload (BREAKING — credentialId field missing):
\`\`\`json
{
  "event": "credential.issued",
  "talentDid": "did:pkh:eip155:8453:0x...",
  "issuerDid": "did:web:example.edu",
  "issuedAt": "2026-03-20T10:00:00Z",
  "schemaId": "schema_skill_v2"
}
\`\`\`

Root cause: The serializer refactoring in v2.1.0 (PR #847) renamed the internal field from \`credential_id\` to \`id\` but the webhook event builder still referenced \`credential_id\`, which resolved to undefined and was omitted from the JSON output.

Impact: Any webhook consumer that relies on \`credentialId\` to correlate events will silently fail (the field is simply absent, not null).

Fix: v2.1.1 hotfix (PR #852) — restores \`credentialId\` field. Additionally adds \`id\` as an alias for forward compatibility.

Affected customers: Any issuer or partner with webhook integrations (primarily Growth/Enterprise tier). ~15 active webhook integrations in production.`,
  },
  {
    chunk_id: "mc_beta_ss_zk_batch_limits",
    product_slug: "ss",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/ss-zk-batch-limits",
    section_path: "Known Issues > Performance > ZK Proof Batch Size Limits",
    content: `SkillSeal's ZK (Zero-Knowledge) selective disclosure uses Groth16 proofs for privacy-preserving credential verification. Performance characteristics:

- **Per-candidate proof time**: ~2 seconds (CPU-bound, single-threaded Groth16 prover)
- **Worker timeout**: 30 seconds (configurable via ZK_WORKER_TIMEOUT_MS env var)
- **Effective batch limit with ZK**: ~10 candidates per batch before timeout risk
- **Standard verification (non-ZK)**: ~50ms per candidate (just cryptographic signature check)

Why batches >10 fail:
- 10 candidates × 2s each = 20s (within 30s timeout)
- 15 candidates × 2s each = 30s (right at the limit, frequent timeouts)
- 50 candidates × 2s each = 100s (guaranteed timeout)

The UI shows a spinner with no error message because the timeout is caught by the API gateway, not the application layer. The gateway returns 504 Gateway Timeout but the frontend interprets this as a generic network error.

Workaround for large batches:
1. Split into sub-batches of 10 with ZK selective disclosure
2. Use standard verification (no ZK) for initial screening, then run ZK only on shortlisted candidates
3. For Recruiter Pro customers: contact support to enable the high-performance ZK worker (horizontally scaled, 4 workers, effective batch limit ~40)

Long-term fix: migrate to Halo2 proving system (3x faster) — tracked in ROADMAP-Q3-2026.`,
  },
  {
    chunk_id: "mc_beta_ss_did_migration",
    product_slug: "ss",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/ss-did-domain-migration",
    section_path: "FAQ > Identity > DID Domain Migration",
    content: `When an institutional issuer migrates to a new domain, the DID (Decentralized Identifier) document must be updated to reflect the new domain. Here is the step-by-step process:

1. **Add DNS TXT record to new domain:**
   Record type: TXT
   Name: \`_skillseal-verification\`
   Value: \`skillseal-verification=<your-verification-token>\`
   (Your verification token is shown in Issuer Command Center > Settings > Domain Verification)

2. **Re-trigger KYB verification:**
   Go to Issuer Command Center > Settings > Domain Verification > "Verify New Domain"
   Enter the new domain URL and click "Start Verification"

3. **Wait for DNS propagation:** 24-48 hours for full propagation. SkillSeal checks every 6 hours.

4. **DID document auto-update:** Once verified, SkillSeal automatically updates the DID document to reference the new domain. The \`did:web\` identifier changes from \`did:web:olddomain.com\` to \`did:web:newdomain.edu\`.

5. **Existing credentials remain valid:** Credentials already issued reference the DID, not the domain directly. Once the DID document resolves under the new domain, all existing credentials verify correctly again.

Important: During the 24-48h transition, credentials issued from this institution will show "Issuer verification pending" instead of "Issuer verification failed." This is a softer error designed for domain migration scenarios.

The old domain's DNS TXT record can be removed after verification of the new domain is complete.`,
  },
  {
    chunk_id: "mc_beta_ss_metaskill_synthesis",
    product_slug: "ss",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/ss-metaskill-synthesis",
    section_path: "Known Issues > AI > Meta-Skill Synthesis Criteria",
    content: `SkillSeal's Meta-Skill synthesis automatically combines individual verified credentials into composite "Meta-Skill" credentials (e.g. "Web3 Full-Stack Developer" from Solidity + React + Node.js badges).

Current synthesis logic:
1. Groups credentials by skill domain (e.g. "blockchain", "frontend", "backend")
2. Within each domain, selects the credential with the **highest confidence score** (not the newest date)
3. Combines selected credentials into a composite with a weighted average confidence

Known limitation:
- An older credential with confidence=0.95 beats a newer credential with confidence=0.88, even if the older one covers a deprecated technology version (e.g. Solidity v0.7 vs v0.8)
- This can result in composites that show outdated skills, which is misleading for job applications

Workaround for users:
- Go to Vault > Credentials > select the deprecated credential > "Exclude from Synthesis"
- This removes it from future synthesis runs. Existing composites must be manually regenerated: Vault > Meta-Skills > [composite] > "Regenerate"

Planned fix (ROADMAP-Q2-2026):
- Add "deprecation window" config: credentials older than N years in a domain where a newer credential exists are auto-excluded
- Prefer newest date when confidence scores are within 10% of each other
- Notify user before synthesis if a potentially outdated credential would be included`,
  },
  {
    chunk_id: "mc_beta_ss_batch_verify_api",
    product_slug: "ss",
    source_type: "faq",
    tier: 1,
    source_uri: "internal://beta-kb/ss-batch-verify-api",
    section_path: "FAQ > API > Batch Verification API Reference",
    content: `SkillSeal's batch verification endpoint allows verifiers to check multiple credentials in a single API call.

Endpoint: \`POST /api/v1/credentials/verify-batch\`

Request body:
\`\`\`json
{
  "credentials": [
    { "credentialId": "cred_abc123" },
    { "credentialId": "cred_def456" }
  ],
  "options": {
    "includeProof": false,
    "zkDisclosure": null
  }
}
\`\`\`

Limits:
- Max batch size: 500 credentials per request
- Request timeout: 60 seconds
- Rate limit: 100 requests/minute (Growth), 500 requests/minute (Enterprise)

Error codes:
- 400: Validation error (missing fields, invalid credential IDs)
- 429: Rate limit exceeded
- 500: Internal server error (usually database or infrastructure failure)
- 504: Gateway timeout (batch too large or ZK proofs included)

Regression history:
- v2.0.5: Fixed batch sizes >200 causing memory spike (doubled server RAM requirement)
- v2.1.0: Introduced regression where batches >50 with ZK options fail with 500 (serializer issue with credentialId — see webhook changelog)
- v2.1.1: Fixed credentialId serializer, restored batch verification for all sizes

If receiving 500 errors on batches that previously worked, check the release notes for the current version. Recent deployments are the most common cause of regression.`,
  },
  {
    chunk_id: "mc_beta_ss_mobile_wallet",
    product_slug: "ss",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/ss-mobile-wallet-compat",
    section_path: "Known Issues > Mobile > Mobile Wallet Compatibility",
    content: `SkillSeal's mobile wallet uses WebAssembly (WASM) for client-side ZK proof generation via SnarkJS.

Supported platforms:
- iOS Safari 16+ (iPhone 12 and newer recommended for performance)
- Android Chrome 110+
- Samsung Internet 20+

Known issues:
1. **Safari Private Browsing blocks IndexedDB** — SnarkJS stores the proving key in IndexedDB. In Private Browsing mode, Safari silently blocks IndexedDB writes, causing proof generation to fail with no error visible to the user. The "Generate Proof" button appears to do nothing.
   - Workaround: Exit Private Browsing mode, or use the desktop wallet
   - Long-term fix: Detect Private Browsing and show a clear error message (tracked in ISSUE-623)

2. **WASM memory limits on older devices** — Groth16 proof generation requires ~256MB of WASM linear memory. Older devices (iPhone 11, Pixel 5) may crash the browser tab silently.
   - Workaround: Use desktop browser for proof generation

3. **iOS Safari WebRTC conflict** — if the user has an active video call (FaceTime, Meet) while generating a proof, the WASM execution is throttled by the OS, causing timeout. Close all media-heavy apps before generating proofs.

Fallback: If mobile proof generation fails, users are directed to the desktop wallet at wallet.skillseal.io with a QR code for seamless transition.`,
  },
  {
    chunk_id: "mc_beta_ss_anchor_retry",
    product_slug: "ss",
    source_type: "known_issues",
    tier: 1,
    source_uri: "internal://beta-kb/ss-blockchain-anchor-retry",
    section_path: "Known Issues > Infrastructure > Blockchain Anchor Retry Policy",
    content: `SkillSeal anchors credential hashes to Base L2 (chainId: 8453) for tamper-proof verification. The anchor service handles gas estimation and transaction submission.

Gas estimation strategy:
- Uses EIP-1559 dynamic fee model
- Base fee: read from latest block header
- Priority fee: 10% above median of last 10 blocks
- Max fee: 2x base fee (ceiling to prevent overpaying during spikes)

Retry policy:
1. **First attempt**: submit with estimated gas
2. **Second attempt** (after 30s): bump priority fee by 25%
3. **Third attempt** (after 60s): bump priority fee by 50% and increase gas limit by 20%
4. **Failure**: move to manual retry queue, create alert

Manual retry queue:
- Admin dashboard: Infrastructure > Anchor Queue
- Shows all failed anchoring transactions with error details
- "Retry with current gas" button re-estimates and resubmits
- "Retry with custom gas" allows manual gas price override

Monitoring alerts:
- Threshold: >50% failure rate in 1-hour window → Critical alert to all leads
- Threshold: >20% failure rate in 1-hour window → Warning alert to on-call
- Alert channels: Slack #infrastructure + email to change_lead

Common causes of mass failures:
1. Base L2 network congestion (high gas prices exceed max fee ceiling)
2. RPC provider rate limiting (Alchemy/Infura free tier exceeded)
3. Nonce gap (previous transaction stuck, blocking subsequent ones)

Resolution for gas spikes: temporarily increase MAX_GAS_MULTIPLIER env var from 2x to 3x. For nonce gaps: use the "Reset Nonce" button in the anchor queue admin page.`,
  },
]

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { product, dryRun } = parseArgs()

  const filtered = chunks.filter((c) => {
    if (product === "all") return true
    return c.product_slug === product
  })

  console.log(`\n🧠 Beta Evaluation — Knowledge Base Seed`)
  console.log(`   Product filter: ${product}`)
  console.log(`   Chunks to seed: ${filtered.length}`)
  console.log(`   Dry run: ${dryRun}\n`)

  if (dryRun) {
    for (const chunk of filtered) {
      console.log(`  [dry-run] ${chunk.chunk_id} — ${chunk.section_path} (${chunk.content.length} chars)`)
    }
    console.log(`\n✅ Dry run complete. ${filtered.length} chunks would be seeded.`)
    return
  }

  const db = getDb()

  // ── Discover product IDs by name ────────────────────────────────────────
  const products = await db<Array<{ product_id: string; name: string }>>`
    SELECT product_id, name FROM products WHERE name IN ('DocuGardener', 'SkillSeal')
  `
  const productMap: Record<string, string> = {}
  for (const p of products) {
    if (p.name === "DocuGardener") productMap["dg"] = p.product_id
    if (p.name === "SkillSeal") productMap["ss"] = p.product_id
  }

  console.log(`  Products found:`)
  if (productMap["dg"]) console.log(`    DocuGardener: ${productMap["dg"]}`)
  if (productMap["ss"]) console.log(`    SkillSeal:    ${productMap["ss"]}`)

  if (product !== "ss" && !productMap["dg"]) {
    console.error(`\n❌ DocuGardener product not found in DB. Create it first via Console.`)
    await closeDb()
    process.exit(1)
  }
  if (product !== "dg" && !productMap["ss"]) {
    console.error(`\n❌ SkillSeal product not found in DB. Create it first via Console.`)
    await closeDb()
    process.exit(1)
  }

  let inserted = 0
  let skipped = 0
  let embedFailed = 0

  for (const chunk of filtered) {
    const productId = productMap[chunk.product_slug]
    if (!productId) {
      console.warn(`  [skip] ${chunk.chunk_id} — product ${chunk.product_slug} not found`)
      skipped++
      continue
    }

    const contentHash = crypto
      .createHash("sha256")
      .update(chunk.content)
      .digest("hex")
      .slice(0, 20)

    // Generate embedding
    let embeddingVector: number[] | null = null
    try {
      const result = await embedText(chunk.content)
      embeddingVector = result.embedding
      console.log(`  [embed ok]   ${chunk.chunk_id} (${embeddingVector.length} dims)`)
    } catch (err) {
      console.warn(`  [embed fail] ${chunk.chunk_id} — inserting with NULL embedding. Error: ${String(err)}`)
      embedFailed++
    }

    const embeddingLiteral =
      embeddingVector !== null ? `[${embeddingVector.join(",")}]` : null

    try {
      if (embeddingLiteral !== null) {
        await db`
          INSERT INTO memory_chunks (
            chunk_id, product_id, source_type, tier, source_uri,
            section_path, content_type, content, product_version,
            content_hash, source_updated_at, embedding, ingested_at
          ) VALUES (
            ${chunk.chunk_id}, ${productId}, ${chunk.source_type}, ${chunk.tier},
            ${chunk.source_uri}, ${chunk.section_path}, 'prose', ${chunk.content},
            '1.0', ${contentHash}, NOW(),
            ${embeddingLiteral}::vector, NOW()
          )
          ON CONFLICT (chunk_id) DO UPDATE SET
            content = EXCLUDED.content,
            content_hash = EXCLUDED.content_hash,
            source_updated_at = EXCLUDED.source_updated_at,
            embedding = EXCLUDED.embedding,
            ingested_at = NOW()
        `
      } else {
        await db`
          INSERT INTO memory_chunks (
            chunk_id, product_id, source_type, tier, source_uri,
            section_path, content_type, content, product_version,
            content_hash, source_updated_at, ingested_at
          ) VALUES (
            ${chunk.chunk_id}, ${productId}, ${chunk.source_type}, ${chunk.tier},
            ${chunk.source_uri}, ${chunk.section_path}, 'prose', ${chunk.content},
            '1.0', ${contentHash}, NOW(), NOW()
          )
          ON CONFLICT (chunk_id) DO UPDATE SET
            content = EXCLUDED.content,
            content_hash = EXCLUDED.content_hash,
            source_updated_at = EXCLUDED.source_updated_at,
            ingested_at = NOW()
        `
      }
      inserted++
      console.log(`  [inserted]   ${chunk.chunk_id}`)
    } catch (err) {
      console.error(`  [error]      ${chunk.chunk_id}: ${String(err)}`)
      if (err instanceof Error && err.stack) console.error(err.stack)
      skipped++
    }
  }

  console.log(`\n📊 Summary:`)
  console.log(`   Inserted/updated: ${inserted}`)
  console.log(`   Skipped/errors:   ${skipped}`)
  console.log(`   Embed failures:   ${embedFailed}`)
  console.log(`   Total chunks:     ${filtered.length}`)

  await closeDb()
  console.log(`\n✅ Knowledge seed complete.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
