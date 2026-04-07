# Beta Evaluation — Run Plan & Automation Split

> **Companion to:** `docs/business/beta-evaluation-scenarios.md`
>
> **Purpose:** Classify all 21 evaluation scenarios (+ 1 new) into two groups:
> - **Group A — Automated:** Can be fully validated via `inject-signals.ts` + DB/API assertions, no human interaction needed.
> - **Group B — Manual:** Require UI interaction in the Console, real email/GitHub delivery verification, or human judgment calls.
>
> **Principle:** A scenario is in Group A only if *every pass criterion* can be checked programmatically. A scenario goes to Group B if even one checkpoint requires visual UI inspection, real email delivery, or an operator click.
>
> **Date:** 2026-04-01

---

## Validation notes — full scenario review

Before splitting, findings from reading all 21 scenarios against the 2026-03-24 execution results:

| # | Finding | Action |
|---|---------|--------|
| 1 | DG-09 requires DG-03 resolved with `ai_resolved: true` — this hard dependency must be enforced in run order. | Documented in Group A prerequisites. |
| 2 | XP-02 requires DG-02 run first (sarah.chen@medcore.io identity must exist). | Enforced via run-order dependency. |
| 3 | SS-09 requires a DB setup step (set OU usage to 100%). No inject-signals.ts support yet. | New step added to script or manual DB command. |
| 4 | XP-03 Step A (upload via Console) is manual; Step B (injection + retrieval assertion) is automated. | Split across both groups. |
| 5 | pg-boss reliability issue (#11) means live-channel dispatches may require manual re-dispatch. | Group A scripts use direct-dispatch mode (bypass pg-boss); Group B accepts this as known gap. |
| 6 | DG-07 and SS-07 chat widget scenarios: signal injection is automatable; visual SSE push and live widget are not. | Split: inject+triage assertion in A, widget UX in B. |
| 7 | All DEFERRED-24 EmailReplyPanel checkpoints (draft visible, editable, sendable) are UI-only. | Group B. |
| 8 | Scenarios already executed and confirmed (DG-01 through SS-06 selected subset) still belong here as **regression scenarios** for Group A. | Marked with ✅ where execution results exist. |

### New scenario added: OP-01

The current 21 scenarios do not cover the **multi-product context switch** — a real operator workflow where open cases in both DG and SS must be managed concurrently. Added as OP-01 in Group B.

---

## Group A — Automated (no human input required)

Run with a single command per scenario or `--all`. Pass/fail is objective and script-verifiable.

### Prerequisites

```bash
# 1. Services running
npx tsx --env-file .env src/index.ts           # backend :3001
cd console && npm run dev                       # console :3002
npx tsx --env-file .env src/platform-proxy.ts  # PlatformCloud :4000

# 2. KB seeded
npx tsx --env-file .env scripts/beta-eval/seed-knowledge.ts

# 3. Products exist — get IDs
DG_PRODUCT_ID=$(psql $DATABASE_URL -tAc "SELECT product_id FROM products WHERE slug='docugardener'")
SS_PRODUCT_ID=$(psql $DATABASE_URL -tAc "SELECT product_id FROM products WHERE slug='skillseal'")
```

---

### DG-01 · GitHub false positive — triage + KB evidence ✅

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts \
  --scenario DG-01 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions (DB):**
```sql
-- Case created
SELECT severity, type, labels FROM cases
  WHERE product_id = '<DG_PRODUCT_ID>'
  ORDER BY created_at DESC LIMIT 1;
-- ✅ severity IN ('high','critical'), labels @> ARRAY['false_positive']

-- KB evidence retrieved
SELECT evidence_refs FROM cases WHERE ... ;
-- ✅ evidence_refs is not empty, contains 'mc_beta_dg_docuignore' or 'mc_beta_dg_blast_radius'
```

**Pass criteria:** Case created; severity high or critical; at least 1 KB evidence ref from docuignore/blast_radius chunks.

**Note:** GitHub auto-reply posting and CR creation are Group B steps.

---

### DG-02 · Export broken before audit — triage + escalation state ✅

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-02 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, status FROM cases WHERE product_id = '<DG>' ORDER BY created_at DESC LIMIT 1;
-- ✅ severity IN ('high','critical'), status = 'awaiting-lead'

-- Draft reply persisted
SELECT draft_reply IS NOT NULL FROM cases WHERE ...;
-- ✅ true
```

**Pass criteria:** Case is `awaiting-lead` with a non-null `draft_reply`. EmailReplyPanel content, send action, and email delivery are Group B.

---

### DG-03 · Nightly rollup config — full auto-resolution ✅

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-03 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
# Wait 60s for agent pipeline, then assert
sleep 60
```

**Assertions:**
```sql
-- Auto-resolved
SELECT status, ai_resolved FROM cases WHERE product_id = '<DG>'
  AND signals.source_email = 'priya@scaleup.io' ORDER BY created_at DESC LIMIT 1;
-- ✅ status = 'resolved', ai_resolved = true

-- Outbound signal created
SELECT COUNT(*) FROM signals WHERE direction = 'outbound' AND case_id = '<case_id>';
-- ✅ >= 1
```

**Pass criteria:** Case reaches `resolved` with `ai_resolved = true`; outbound reply signal exists. Actual email delivery to Priya is Group B.

**Dependency for DG-09:** Record the `case_id` of this resolved case.

---

### DG-04 · Drift score inconsistency — triage + partial AI

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-04 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, status, evidence_refs FROM cases WHERE ... ORDER BY created_at DESC LIMIT 1;
-- ✅ severity IN ('medium','high')
-- ✅ evidence_refs contains 'mc_beta_dg_embedding_refresh'
-- ✅ status IN ('awaiting-lead','in-resolution')
```

**Pass criteria:** Severity medium or high; KB embedding_refresh article retrieved. CR creation and GitHub reply are Group B.

---

### DG-05 · Billing dispute — forbidden phrase gate fires

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-05 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT status, type, labels FROM cases WHERE ... ORDER BY created_at DESC LIMIT 1;
-- ✅ status = 'awaiting-lead'  (refund gate blocked auto-send)
-- ✅ labels @> ARRAY['billing']

SELECT draft_reply IS NOT NULL FROM cases WHERE ...;
-- ✅ true
```

**Pass criteria:** Case `awaiting-lead` (forbidden phrase gate fired); billing KB article referenced in evidence; draft_reply persisted. Stripe check and email send are Group B.

---

### DG-06 · Setup crash — triage + stack trace metadata ✅

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-06 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, type, labels, triage_metadata FROM cases WHERE ... ORDER BY created_at DESC LIMIT 1;
-- ✅ severity = 'normal'
-- ✅ labels contains 'setup-wizard' or 'pagination'
-- ✅ triage_metadata includes browser/version/env info extracted from body
```

**Pass criteria:** Correct normal severity; setup-related labels; structured metadata extracted from stack trace body. CR creation and GitHub reply are Group B.

---

### DG-07 · Chat widget — signal creation + SSE event

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-07 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT status, source_type, labels FROM cases
  JOIN signals ON signals.case_id = cases.case_id
  WHERE signals.source_type = 'chat' ORDER BY cases.created_at DESC LIMIT 1;
-- ✅ source_type = 'chat', severity = 'normal'
-- ✅ labels @> ARRAY['oauth'] or ARRAY['github-enterprise']
```

```bash
# Verify SSE event was published (check signal outbound or pg-boss job created)
psql $DATABASE_URL -c "SELECT state FROM pgboss.job WHERE name = 'auto-reply' ORDER BY createdon DESC LIMIT 1;"
# ✅ state IN ('created','active','completed')
```

**Pass criteria:** Case created from chat signal; SSE reply job dispatched. Visual widget rendering, real-time SSE push to browser, and Live Chats tab are Group B.

---

### DG-08 · Contact form sales inquiry — routing classification

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario DG-08 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, type, labels, status FROM cases WHERE ... ORDER BY created_at DESC LIMIT 1;
-- ✅ type IN ('pre-sales','user_request')
-- ✅ labels @> ARRAY['enterprise'] OR triage_metadata->>'routingTeam' = 'sales'
-- ✅ status = 'awaiting-lead'
-- ✅ severity = 'normal' or 'low'
```

**Pass criteria:** Routed to sales/human lead, not auto-resolved. EmailReplyPanel ack draft and email delivery are Group B.

---

### DG-09 · Knowledge capture after AI resolution

**Prerequisite:** DG-03 must be `status = 'resolved'` with `ai_resolved = true`. Run DG-03 first and wait.

```bash
# Verify DG-03 is resolved
DG03_CASE=$(psql $DATABASE_URL -tAc "
  SELECT c.case_id FROM cases c
  JOIN signals s ON s.case_id = c.case_id
  WHERE s.source_email = 'priya@scaleup.io' AND c.status = 'resolved'
  ORDER BY c.created_at DESC LIMIT 1
")

# Check pg-boss knowledge_capture job was dispatched
psql $DATABASE_URL -c "
  SELECT name, state, data FROM pgboss.job
  WHERE name = 'knowledge-capture'
  ORDER BY createdon DESC LIMIT 5;
"
# ✅ A 'knowledge-capture' job exists for this case
```

**Wait for agent completion (up to 60s), then:**
```sql
SELECT COUNT(*) FROM knowledge_assets WHERE product_id = '<DG>' AND status = 'pending-review';
-- ✅ >= 1 new asset created after DG-03 resolution
```

**Tier gate test:**
```bash
# Temporarily set Community tier, re-run (or check gate logic directly)
psql $DATABASE_URL -c "UPDATE products SET license_tier = 'community' WHERE product_id = '<DG>'"
# Re-inject DG-03, expect knowledge_capture job NOT dispatched
# ✅ No new 'knowledge-capture' job
psql $DATABASE_URL -c "UPDATE products SET license_tier = 'scale' WHERE product_id = '<DG>'"
```

**Pass criteria:** `knowledge-capture` job dispatched; new knowledge asset in `pending-review` state; Community tier blocks dispatch. Knowledge tab UI and operator review workflow are Group B.

---

### SS-01 · Credential not in vault — triage + draft persistence

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-01 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, status, draft_reply IS NOT NULL, evidence_refs FROM cases WHERE ... LIMIT 1;
-- ✅ severity IN ('high','critical')
-- ✅ status = 'awaiting-lead'
-- ✅ draft_reply IS NOT NULL
-- ✅ evidence_refs contains 'mc_beta_ss_claim_pipeline' or 'mc_beta_ss_bullmq'
```

**Pass criteria:** High/Critical; draft persisted; BullMQ KB evidence referenced. EmailReplyPanel, email delivery, and credential monitoring are Group B.

---

### SS-02 · Webhook regression — Critical severity + lead notification

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-02 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, type, status FROM cases WHERE ... LIMIT 1;
-- ✅ severity = 'critical'
-- ✅ type = 'bug_report'
-- ✅ status = 'awaiting-lead'
```

```bash
# Notification sent
psql $DATABASE_URL -c "
  SELECT COUNT(*) FROM notifications n
  JOIN cases c ON c.case_id = n.case_id
  WHERE c.severity = 'critical'
  ORDER BY n.created_at DESC LIMIT 1;
"
# ✅ >= 1 notification record
```

**Pass criteria:** Critical severity; lead notification created (quiet-hours bypassed). CR creation, PR draft, GitHub posting, and replay tracking are Group B.

---

### SS-03 · ZK proof timeout — KB workaround + path decision

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-03 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
sleep 60
```

**Assertions:**
```sql
SELECT severity, status, evidence_refs, draft_reply IS NOT NULL FROM cases WHERE ... LIMIT 1;
-- ✅ severity IN ('high','critical')
-- ✅ evidence_refs contains 'mc_beta_ss_zk_batch_limits'
-- Path A: status = 'resolved', draft_reply IS NULL
-- Path B: status = 'awaiting-lead', draft_reply IS NOT NULL
```

**Pass criteria:** ZK batch KB article retrieved; case either auto-resolved (Path A) or held with draft (Path B). Email delivery is Group B.

---

### SS-04 · DID domain migration — full auto-resolution ✅

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-04 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
sleep 60
```

**Assertions:**
```sql
SELECT status, ai_resolved, evidence_refs FROM cases WHERE ... LIMIT 1;
-- ✅ status = 'resolved', ai_resolved = true
-- ✅ evidence_refs contains 'mc_beta_ss_did_migration'

SELECT COUNT(*) FROM signals WHERE direction = 'outbound' AND case_id = '<case_id>';
-- ✅ >= 1
```

**Pass criteria:** Auto-resolved; DID migration KB article retrieved; outbound signal created. Email delivery to James is Group B.

---

### SS-05 · Meta-Skill composite — sensitivity gate → awaiting-lead

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-05 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, status, draft_reply IS NOT NULL FROM cases WHERE ... LIMIT 1;
-- ✅ severity IN ('medium','high')
-- ✅ status = 'awaiting-lead'  (sensitivity gate fired)
-- ✅ draft_reply IS NOT NULL
```

**Pass criteria:** Sensitivity gate holds auto-reply; empathetic draft persisted. Re-synthesis, EmailReplyPanel rewrite, and email delivery are Group B.

---

### SS-06 · Batch verification API 500 — outage routing + notification ✅

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-06 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, type, status FROM cases WHERE ... LIMIT 1;
-- ✅ severity = 'critical'
-- ✅ type = 'bug_report' or 'outage_report'
-- ✅ status = 'awaiting-lead'

-- Outage routing
SELECT COUNT(*) FROM pgboss.job WHERE name = 'outage-routing' ORDER BY createdon DESC LIMIT 1;
-- ✅ >= 1

-- Notification bypassed quiet hours
SELECT created_at, priority FROM notifications n JOIN cases c ON c.case_id = n.case_id
  WHERE c.severity = 'critical' ORDER BY n.created_at DESC LIMIT 1;
-- ✅ priority = 'immediate' or similar
```

**Pass criteria:** Critical triage; outage routing job dispatched; high-priority notification created. EmailReplyPanel, email delivery, and CR are Group B.

---

### SS-07 · Chat widget ZK proof — signal + triage + SSE event

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-07 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, status, source_type, labels FROM cases
  JOIN signals ON signals.case_id = cases.case_id
  WHERE signals.source_type = 'chat' AND cases.product_id = '<SS>'
  ORDER BY cases.created_at DESC LIMIT 1;
-- ✅ severity = 'high'
-- ✅ labels @> ARRAY['mobile'] or ARRAY['zk-proof']
-- ✅ status = 'awaiting-lead'  (ZK infra — not auto-resolvable)
```

**Pass criteria:** High severity; mobile/ZK labels; case `awaiting-lead`. Visual widget, SSE push to browser, and operator reply are Group B.

---

### SS-08 · Blockchain anchor failure — scheduled signal + outage routing

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-08 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
SELECT severity, type, status FROM cases WHERE product_id = '<SS>'
  ORDER BY created_at DESC LIMIT 1;
-- ✅ severity = 'critical'
-- ✅ type = 'outage_report'
-- ✅ status = 'awaiting-lead'

SELECT COUNT(*) FROM pgboss.job WHERE name = 'outage-routing' ORDER BY createdon DESC LIMIT 1;
-- ✅ >= 1 (outage routing dispatched)
```

**Pass criteria:** Critical monitoring alert correctly escalated; outage routing triggered. CR quality and infra action are Group B.

---

### SS-09 · OU limit enforcement — graceful degradation

**Setup (one-time per test run):**
```bash
# Set OU usage to 100% for SkillSeal
psql $DATABASE_URL -c "
  INSERT INTO product_llm_usage (product_id, period_start, ou_used, ou_limit)
  VALUES ('<SS_PRODUCT_ID>', date_trunc('month', now()), 10000, 10000)
  ON CONFLICT (product_id, period_start)
  DO UPDATE SET ou_used = 10000;
"
```

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario SS-09 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
-- Signal accepted (ingress always accepts)
SELECT signal_id FROM signals WHERE product_id = '<SS>'
  ORDER BY created_at DESC LIMIT 1;
-- ✅ Signal exists

-- Case created but NOT triaged
SELECT status FROM cases WHERE product_id = '<SS>'
  ORDER BY created_at DESC LIMIT 1;
-- ✅ status = 'new'  (no triage job was dispatched)

-- No triage job in pg-boss
SELECT COUNT(*) FROM pgboss.job WHERE name = 'triage'
  AND data->>'productId' = '<SS_PRODUCT_ID>'
  AND createdon > now() - interval '2 minutes';
-- ✅ 0

-- Operator notification exists
SELECT COUNT(*) FROM notifications WHERE type = 'ou-limit-reached';
-- ✅ >= 1
```

**Cleanup:**
```bash
psql $DATABASE_URL -c "UPDATE product_llm_usage SET ou_used = 0 WHERE product_id = '<SS_PRODUCT_ID>'"
```

**Pass criteria:** Signal preserved; triage NOT dispatched; operator notification created. Visual OU bar in Settings and plan upgrade flow are Group B.

---

### XP-01 · Bridge event doc drift — case creation + routing

```bash
# Inject directly via API (bridge events not in inject-signals.ts yet)
curl -s -X POST http://localhost:3001/api/v1/bridge/event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "event": "bridge.doc-gap.detected",
    "sourceProduct": "docugardener",
    "targetProduct": "nestfleet",
    "payload": {
      "docPath": "docs/api/signals.md",
      "currentVersion": "v1.2",
      "latestCodeVersion": "v1.5",
      "driftScore": 0.73,
      "affectedEndpoints": ["POST /api/v1/signals"]
    }
  }'
```

**Assertions:**
```sql
SELECT severity, type, labels, status FROM cases WHERE product_id = '<DG>'
  ORDER BY created_at DESC LIMIT 1;
-- ✅ severity IN ('low','normal')
-- ✅ labels @> ARRAY['doc-drift'] or ARRAY['bridge-event']
-- ✅ status != 'escalated'  (should NOT escalate)
```

**Pass criteria:** Case created; low severity; not auto-escalated. Cross-product lineage graph and knowledge badge are Group B.

---

### XP-02 · Cross-product identity — email deduplication

**Prerequisite:** DG-02 must have been run so `sarah.chen@medcore.io` has an identity in DocuGardener.

```bash
npx tsx --env-file .env scripts/beta-eval/inject-signals.ts --scenario XP-02 \
  --dg-product-id $DG_PRODUCT_ID --ss-product-id $SS_PRODUCT_ID
```

**Assertions:**
```sql
-- Identity created for SkillSeal
SELECT identity_id, email FROM identities
  WHERE email = 'sarah.chen@medcore.io' AND product_id = '<SS>';
-- ✅ EXISTS

-- Cross-product link (if global identity is implemented)
SELECT COUNT(DISTINCT product_id) FROM identities WHERE email = 'sarah.chen@medcore.io';
-- ✅ >= 2  (both DG and SS)
```

**Pass criteria:** Identity exists in SkillSeal; email correctly associated. Cross-product context in case view UI is Group B.

---

### XP-03 · Memory ingest + retrieval (Step B only)

**Prerequisite:** XP-03 Step A (manual Console upload) must have been completed — see Group B.

```bash
# Inject signal that should hit the newly uploaded revocation doc
curl -s -X POST http://localhost:3001/api/v1/ingress/email \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "productId": "<SS_PRODUCT_ID>",
    "fromEmail": "compliance@finserv.co",
    "fromName": "FinServ Compliance",
    "subject": "Revoked credential still showing as valid after 30 minutes",
    "body": "We revoked a credential for a terminated employee 30 minutes ago but verifiers still see it as valid. This is a compliance issue."
  }'
sleep 60
```

**Assertions:**
```sql
SELECT evidence_refs FROM cases WHERE product_id = '<SS>'
  ORDER BY created_at DESC LIMIT 1;
-- ✅ evidence_refs includes the newly uploaded source (not just pre-seeded beta KB)
-- ✅ draft_reply contains '15 minutes' or 'polling interval' (content from uploaded doc)
```

**Pass criteria:** Triage agent retrieved the just-uploaded doc; evidence attribution includes new source. Console upload UI (Step A) and visual evidence attribution are Group B.

---

## Group B — Manual (requires human interaction)

Run these interactively. For each scenario, use the Console at `http://localhost:3002` and verify the listed checkpoints.

### Common Group B setup

1. Browser open at `http://localhost:3002`, logged in as Alexey (admin role)
2. Two products visible: DocuGardener (`/p/docugardener`) and SkillSeal (`/p/skillseal`)
3. Resend sandbox active — check delivery at `resend.com/emails`
4. GitHub notifications enabled for `alexey-kopachev/docugardener` and `alexey-kopachev/skillseal`

---

### DG-01 (B) · GitHub auto-reply + CR creation

After Group A injection (case exists):

- [ ] Open Console → DocuGardener → Cases → most recent case
- [ ] Verify AI draft shows `.docuignore` workaround or blast-radius config option
- [ ] If gates passed: verify GitHub issue has auto-reply comment via `addIssueComment()`
- [ ] If gates failed: review draft → click "Approve Reply" → verify comment posted to GitHub issue
- [ ] Click "Create Change Request" → verify CR carries PR number, drift score, and KB context
- [ ] Verify CR → Lead queue shows correctly

---

### DG-02 (B) · EmailReplyPanel + Lead escalation ✅

After Group A injection:

- [ ] Open case for sarah.chen@medcore.io
- [ ] Verify **EmailReplyPanel** visible in case detail (status = `awaiting-lead`)
- [ ] AI draft pre-filled: holding response + SOC2 audit context
- [ ] Click "Escalate to Lead" → case stays `awaiting-lead`
- [ ] Lead view: edit draft in EmailReplyPanel — add date-range chunking workaround
- [ ] Click **"Send Reply"** → verify Resend delivery to `sarah.chen@medcore.io`
- [ ] Verify case status remains `awaiting-lead` after send (does NOT auto-resolve)
- [ ] CR opened for underlying export-timeout bug

---

### DG-03 (B) · Email delivery verification

After Group A confirms auto-resolution:

- [ ] Verify email reached `priya@scaleup.io` (Resend sandbox or real inbox)
- [ ] Verify reply contains `.docugardener.yml` config snippet with specific values
- [ ] Confirm `rollup.consolidate: true` and `rollup.minDriftScore` mentioned

---

### DG-04 (B) · CR creation + GitHub reply

After Group A confirms triage:

- [ ] Open case for Daniel's drift inconsistency
- [ ] Review AI draft — should mention manual `dg reindex --force` command and embedding staleness
- [ ] Approve reply → verify GitHub issue comment posted
- [ ] Create CR: "Investigate per-branch embedding staleness" → verify CR links to GitHub issue
- [ ] CR detail shows correct repo (backend-services), branch names, and drift scores

---

### DG-05 (B) · Stripe check + Lead approval

After Group A confirms forbidden phrase gate fired:

- [ ] Open case for Raj Patel billing dispute
- [ ] Verify EmailReplyPanel shows pro-rata billing KB explanation
- [ ] Operator action: check Stripe record externally → confirm over-charge
- [ ] Click "Escalate to Lead" → Lead approves $15 refund
- [ ] Lead edits draft to add refund confirmation → click "Send Reply"
- [ ] Verify email delivered to `raj.patel@buildfast.io`
- [ ] Create CR: "Fix pro-rata calculation in upgrade webhook"

---

### DG-06 (B) · CR + PR draft quality

After Group A confirms triage:

- [ ] Open case for Alex's setup crash
- [ ] Verify stack trace (`TypeError: Cannot read properties...` + file + line number) is in case metadata
- [ ] Create CR: "Fix RepositoryScanner pagination for 500+ repos"
- [ ] PR draft generation → open in GitHub console → verify branch name, title, and `RepositoryScanner.tsx:142` referenced
- [ ] Approve reply draft → verify GitHub issue comment auto-posted

---

### DG-07 (B) · Chat widget live UX ✅

After Group A confirms case created:

- [ ] Open Chat Widget directly: `http://localhost:3002/widget/test?product=docugardener`
- [ ] Verify pre-chat form renders, submit name/email
- [ ] Send message: "OAuth failing with insufficient scope on GitHub Enterprise"
- [ ] Verify AI response appears in widget via SSE (latency target: <60s)
- [ ] Verify response includes specific GHE OAuth scope guidance (not generic)
- [ ] Open Console → Queue → **Live Chats tab** → confirm case appears with normal severity badge
- [ ] If resolved: widget shows "Start a new chat →" (CHAT-UX-01b)
- [ ] If `awaiting-lead`: verify widget showed immediate acknowledgement (auto-ack on gate fail — bug #9 fix)

---

### DG-08 (B) · Sales routing + EmailReplyPanel ack

After Group A confirms routing:

- [ ] Open case for Jennifer Walsh (BigCorp contact form)
- [ ] Verify type shows `Pre-sales` or sales-appropriate classification
- [ ] Verify company context ("2000+ developers", "BigCorp Financial") in case metadata
- [ ] Confirm "Route to Sales" action appears (not only Route-to-Eng) — fix #10 verified
- [ ] EmailReplyPanel: verify AI draft is a professional ack (not technical troubleshooting)
- [ ] Edit draft to enterprise-appropriate tone → click "Send Reply"
- [ ] Verify email delivered to `j.walsh@bigcorp.com`
- [ ] Case stays `awaiting-lead` after send

---

### DG-09 (B) · Knowledge tab review

After Group A confirms knowledge asset created:

- [ ] Open Console → DocuGardener → Knowledge tab
- [ ] Verify new asset appears with "pending review" badge
- [ ] Asset preview: Q = "How do I consolidate nightly rollup issues?", A includes `.docugardener.yml` snippet
- [ ] Approve asset → verify it becomes searchable in KB
- [ ] Run DG-03 signal again → verify new FAQ asset is retrieved as evidence

---

### SS-01 (B) · BullMQ context + email delivery

After Group A confirms draft persisted:

- [ ] Open case for Amara Diallo
- [ ] EmailReplyPanel: verify AI draft includes BullMQ troubleshooting context from KB
- [ ] Lead edits draft to add explicit BullMQ queue check instructions
- [ ] Click "Send Reply" → verify email delivered (reply-to claim confirmation thread)
- [ ] Case stays `awaiting-lead` (monitoring state — do NOT resolve yet)
- [ ] Draft cleared on next case load (no stale draft)
- [ ] After simulated credential delivery: manually mark case resolved

---

### SS-02 (B) · CR → PR → replay tracking

After Group A confirms critical triage:

- [ ] Open case for Viktor Petrov
- [ ] Review Viktor's logs attached in signal body — confirm regression visible in case detail
- [ ] Create CR: "Hotfix — restore credentialId in webhook payload (v2.1.1)"
- [ ] PR draft generated in SkillSeal GitHub repo → review branch name, hotfix context
- [ ] Approve CR → mark merged → verify case updates on merge
- [ ] Create second CR/action item: "Replay 200+ failed webhooks" → stays open until Viktor confirms
- [ ] Viktor receives GitHub issue comment at each CR stage change → verify comment posted

---

### SS-03 (B) · ZK workaround email delivery

After Group A confirms KB hit:

- [ ] If Path A (auto-resolved): verify email reached `claire@techcorp.com` with batch size=10 workaround
- [ ] If Path B (awaiting-lead): EmailReplyPanel shows ZK batch size concrete numbers → send → email delivery
- [ ] Infra CR: "Increase ZK worker timeout or add horizontal scaling for Groth16 jobs"

---

### SS-04 (B) · Email delivery + 48h follow-up

After Group A confirms auto-resolution:

- [ ] Verify email delivered to `j.hartley@northamptonuniversity.edu` with actual DNS TXT format
- [ ] Reply contains `skillseal-verification=<token>` example and Settings → Domain Verification path
- [ ] Schedule 48h follow-up check in NestFleet (SLA reminder or case note)

---

### SS-05 (B) · Re-synthesis + email

After Group A confirms sensitivity gate held:

- [ ] Open case for Marco Rossi
- [ ] EmailReplyPanel: verify empathetic AI draft (not generic "we'll investigate")
- [ ] Lead manually triggers credential re-synthesis (SkillSeal Issuer Command Center action)
- [ ] Lead rewrites draft: apology + explanation + new composite confirmation
- [ ] Click "Send Reply" → email delivered to `marco.rossi@protonmail.com`
- [ ] Case stays `awaiting-lead` → Lead confirms new composite correct → resolve

---

### SS-06 (B) · CR + email ack delivery ✅

After Group A confirms outage routing:

- [ ] Open case for TalentBridge ops
- [ ] Verify $2M context and March 25 deadline in case metadata
- [ ] EmailReplyPanel: draft is urgency-appropriate ("we've escalated as critical, investigating now")
- [ ] Lead sends reply → verify email delivered to `ops@talentbridge.co`
- [ ] Create CR with March 25 deadline captured in CR metadata
- [ ] Case stays `awaiting-lead` after send

---

### SS-07 (B) · Chat widget escalation + SSE operator reply

After Group A confirms signal + SSE event:

- [ ] Open chat widget: `http://localhost:3002/widget/test?product=skillseal`
- [ ] Send message: "Generate Proof button does nothing on iPhone 15 (Safari) and Pixel 8 (Chrome)"
- [ ] Verify immediate acknowledgement via SSE (auto-ack on `awaiting-lead` — bug #9 fix)
- [ ] Open Console → SkillSeal → Queue → Live Chats → verify case with "high" severity badge
- [ ] Lead opens case → types reply in case chat panel → SSE push to widget
- [ ] User sees reply in real-time without page refresh
- [ ] After resolution: widget shows "Start a new chat →" (409 → CHAT-UX-01b)

---

### SS-08 (B) · CR quality for gas estimation

After Group A confirms outage routing:

- [ ] Open SS-08 case (monitoring/scheduled signal)
- [ ] CR content check: "Implement dynamic gas estimation with fallback for Base L2 congestion"
- [ ] Verify affected issuers receive status notification (not just internal team)
- [ ] Assess: does NestFleet add value over PagerDuty for this scenario? Record finding.

---

### SS-09 (B) · OU bar visual + plan upgrade

After Group A confirms graceful degradation:

- [ ] Open Console → SkillSeal → Settings → Plan
- [ ] Verify OU bar shows 100% (red indicator)
- [ ] Verify untriaged case visible in Cases list with status = `new`
- [ ] Simulate plan upgrade or OU reset → verify queued case gets processed
- [ ] Notification visible in Console (not silent failure)

---

### XP-01 (B) · Cross-product lineage

After Group A confirms case created:

- [ ] Open case created from bridge event
- [ ] Verify lineage shows source = DocuGardener, target = NestFleet API docs
- [ ] Knowledge badge update in Console sidebar (pending review)
- [ ] Check if SkillSeal integration guide also creates a case (multi-product detection)

---

### XP-02 (B) · Cross-product context in case view

After Group A confirms identity exists in SS:

- [ ] Open case for sarah.chen@medcore.io in SkillSeal
- [ ] Case view: check if "Active cases in DocuGardener" context surfaced
- [ ] Assess: is identity resolution email-global or product-scoped?
- [ ] Record finding — shapes future identity architecture

---

### XP-03 (B) · Step A — Console upload + Step B visual verification

**Step A (manual, must run first):**
- [ ] Open Console → SkillSeal → Knowledge → Sources tab
- [ ] Click "Upload" → upload `credential-revocation-propagation.txt` (content from scenario definition)
- [ ] Verify upload completes, source appears in list
- [ ] Health panel coverage increases
- [ ] ⚠️ Note the source ID — needed to verify retrieval in Step B

**Step B (after Group A injection):**
- [ ] Open case for `compliance@finserv.co`
- [ ] Evidence attribution shows the just-uploaded source (not only pre-seeded beta KB)
- [ ] Draft mentions "15 minutes" polling interval and CDN cache purge command
- [ ] Verify latency: upload → retrievable in same session (no batch delay)

---

### NEW: OP-01 · Multi-product context switch during active caseload

> **New scenario added in this run plan (2026-04-01).**
> Tests the DEFERRED-21 product switcher in a realistic operational context.
> Validates that an operator can manage simultaneous open cases across DG and SS without losing context or making a wrong-product action.

**Setup:** Have at least one `awaiting-lead` case in each product (run DG-02 and SS-01 first).

**Signal:** None — this is an operator workflow scenario only.

**Manual steps:**
- [ ] Log in to Console, currently viewing DocuGardener cases
- [ ] Two open cases visible: DG-02 (Sarah — export broken) and SS-01 (Amara — vault empty)
- [ ] Open DG-02 case → start editing EmailReplyPanel draft for Sarah
- [ ] **Switch to SkillSeal** via product switcher (top of sidebar or Cmd+K)
- [ ] Verify: product switcher redirects to `/p/skillseal/cases` correctly
- [ ] Verify: DG case is NOT shown in SkillSeal case list (product isolation)
- [ ] Open SS-01 (Amara's case) — verify EmailReplyPanel shows correct draft for Amara (not DG-02 draft)
- [ ] Switch back to DocuGardener → open DG-02 → verify DG-02 draft is still intact (not overwritten)
- [ ] Complete action in DG-02: send reply
- [ ] Return to SS-01: send reply
- [ ] No cross-product data leakage in either case

**Pass criteria:**
- Product switcher correctly isolates case lists
- Draft state preserved per-case (not shared or overwritten across products)
- No case_id or product_id mismatch in any action taken
- Operator can complete both cases without context loss

---

## Summary table

| ID | Group A (automated) | Group B (manual) |
|----|--------------------|--------------------|
| DG-01 | Triage + KB evidence | GitHub reply + CR |
| DG-02 | Triage + awaiting-lead + draft_reply | EmailReplyPanel + email delivery |
| DG-03 | Auto-resolve + outbound signal | Email delivery verification |
| DG-04 | Triage + KB evidence | CR + GitHub reply |
| DG-05 | Forbidden phrase gate + draft_reply | Stripe check + email delivery |
| DG-06 | Triage + metadata extraction | CR + PR draft quality |
| DG-07 | Case creation + SSE job | Widget rendering + real-time UX |
| DG-08 | Sales routing classification | EmailReplyPanel ack + email |
| DG-09 | Job dispatch + knowledge asset | Knowledge tab review + approval |
| SS-01 | Triage + draft_reply | EmailReplyPanel + email + monitoring |
| SS-02 | Critical triage + notification | CR + PR + replay tracking |
| SS-03 | KB retrieval + path decision | Email delivery (either path) |
| SS-04 | Auto-resolve + outbound signal | Email delivery + 48h follow-up |
| SS-05 | Sensitivity gate + draft_reply | Re-synthesis + email delivery |
| SS-06 | Critical + outage routing | CR + email ack |
| SS-07 | Chat signal + SSE event | Widget + operator SSE reply |
| SS-08 | Monitoring + outage routing | CR quality + infra action |
| SS-09 | OU block + no triage job | OU bar visual + plan upgrade |
| XP-01 | Case creation + routing | Lineage + knowledge badge |
| XP-02 | Identity deduplication | Cross-product context in UI |
| XP-03 | Retrieval after ingest (Step B) | Console upload UI (Step A) |
| OP-01 | — (operator workflow only) | Product switcher + draft isolation |

---

## Running Group A as a regression suite

Once all pass criteria are known-good, Group A scenarios can be assembled into a script:

```bash
#!/bin/bash
# scripts/beta-eval/run-group-a.sh
# Runs all automated beta eval assertions after signal injection.
# Requires: services running, KB seeded, DG_PRODUCT_ID + SS_PRODUCT_ID set.

set -e
SCENARIOS="DG-01 DG-02 DG-03 DG-04 DG-05 DG-06 DG-07 DG-08 SS-01 SS-02 SS-03 SS-04 SS-05 SS-06 SS-07 SS-08 SS-09 XP-02"

for id in $SCENARIOS; do
  echo "→ Injecting $id..."
  npx tsx --env-file .env scripts/beta-eval/inject-signals.ts \
    --scenario "$id" \
    --dg-product-id "$DG_PRODUCT_ID" \
    --ss-product-id "$SS_PRODUCT_ID"
  sleep 5
done

# XP-01: bridge event (separate injection)
# XP-03 Step B: separate injection after manual Step A
# DG-09: requires DG-03 resolved — run last

echo "→ Waiting 90s for agent pipeline..."
sleep 90
echo "→ Run assertions from docs/business/beta-eval-run-plan.md Group A section."
```

**Note on pg-boss reliability:** Until bug #11 is fixed (shared pg-boss instance), some jobs may be orphaned on backend restart. If a case stays in `enriching` after 90s, restart the backend and check the job state.
