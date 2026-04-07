# Beta Evaluation — Manual Runbook & Full Scorecard

> **Generated:** 2026-04-02 · Group A automated run complete
>
> This document gives a full picture of every beta scenario:
> - What the automated assertion found (Group A result)
> - What YOU need to do manually in the Console (Group B steps)
> - Whether the case is **Complete** (both groups done), **Partial** (auto OK, manual pending), or **Failed/Skipped**
>
> **Console URLs:**
> - DocuGardener: `http://localhost:3002/p/docugardener/cases`
> - SkillSeal:    `http://localhost:3002/p/skillseal/cases`
>
> **Role you play:** Operator + Support Lead (solo mode)

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Check passed |
| ⚠️ | Check passed with deviation |
| ❌ | Check failed |
| ⏭ | Skipped — feature not implemented |
| 🔵 | Manual step required from you |
| 🟢 | Case fully complete (automated + manual both done) |
| 🟡 | Automated passed; manual steps still pending |
| 🔴 | Automated failed or skipped; system issue to fix first |

---

## Full Scorecard

| Scenario | Auto Result | Case Status | Full Completion |
|----------|------------|-------------|-----------------|
| DG-01 | ✅ PASS | `resolved` | 🟢 Auto-reply confirmed (email, confidence 0.95). GitHub outbound gap noted (no `addIssueComment`). |
| DG-02 | ✅ PASS | `resolved` | 🟢 Reply sent, export bug CR created & approved. Duplicate case from BEF-12. |
| DG-03 | ⚠️ PARTIAL | `resolved` | 🟢 Reply sent, resolve confirmed. Gate1 boundary bug logged (BEF-03 ✅). Duplicate case from BEF-12. |
| DG-04 | ✅ PASS | `resolved` | 🟢 CR auto-created, PR drafted. |
| DG-05 | ⚠️ PARTIAL | `resolved` | 🟢 Auto-reply policy-compliant. Billing gate miss confirmed (BEF-04 ✅). |
| DG-06 | ⚠️ PARTIAL | `resolved` | 🟢 Reply sent, bug CR created & approved, PR drafted. Severity + KB bugs logged (BEF-05 ✅, BEF-06 ⏳). |
| DG-07 | ✅ PASS | `resolved` | 🟡 SSE browser check deferred → BEF-21 (widget test harness). |
| DG-08 | ✅ PASS | `resolved` | 🟢 Previous session already handled; dedup works. |
| DG-09 | ⏭ SKIP | — | 🔴 Blocked: `ai_resolved` field + `knowledge-capture` job not implemented (BEF-01/02). |
| SS-01 | ✅ PASS | `resolved` | 🟢 Reply sent (vault empty + BullMQ triage), auto-resolved. |
| SS-02 | ⚠️ PARTIAL | `resolved` | 🟢 Hotfix CR + webhook replay CR created & approved. Auto-reply content acceptable. |
| SS-03 | ⚠️ PARTIAL | `resolved` | 🟢 Infra-debt sidecar CR approved, PR drafted (#130/#141). ZK workaround correctly surfaced. |
| SS-04 | ✅ PASS | `resolved` | 🟢 Auto-reply confirmed (DNS migration steps, domain cleanup guidance). |
| SS-05 | ⚠️ PARTIAL | `resolved` | 🟢 Technically correct reply. Empathy gap confirmed (BEF-08 ✅). No follow-up UI available (BEF-16). |
| SS-06 | ⚠️ PARTIAL | `resolved` | 🟢 Outage CR created & approved. Auto-reply technically OK, missing business impact acknowledgment. Duplicate case from BEF-12. |
| SS-07 | ⚠️ PARTIAL | `resolved` | 🟡 Widget not configured for SkillSeal. SSE deferred → BEF-21. |
| SS-08 | ⚠️ PARTIAL | `resolved` | 🟢 Ack reply sent, outage CR created & approved, case manually resolved. INFRA-04 logged for PR merge → auto-resolve. |
| SS-09 | ⏭ SKIP | — | 🔴 Blocked: SS-09 not in inject-signals.ts; schema mismatch (BEF-10 ⏳). |
| XP-01 | ⏭ SKIP | — | 🔴 Blocked: `/api/v1/bridge/event` not implemented (BEF-11 ✅). |
| XP-02 | ✅ PASS | `resolved` | 🟢 Identity recognised. Cross-product lineage link absent — logged as BEF-20. |

---

## Case-by-Case Manual Steps

---

### DG-01 · False Positive Blocks Release · `resolved`

**Auto result:** ✅ Triage correct (high severity, false-positive labels, KB evidence).
Case auto-resolved with confidence 0.85.

**Group B steps — what you need to do:**

🔵 **1. Verify GitHub reply was posted**
- Open Console → `http://localhost:3002/p/docugardener/cases`
- Find case: "False positive blocking release — internal struct rename"
- In case detail, check the Timeline / Signals tab — should show an outbound signal (auto-reply to GitHub)
- If no outbound signal: the gates passed but GitHub `addIssueComment()` may have failed silently
  - Manually review the AI draft in the case view and post it to GitHub issue #412 yourself

🔵 **2. Assess if a Change Request is warranted**
- Review the AI response: did it offer `.docuignore` workaround or `.docugardener.yml` ignore pattern?
- If yes and Marcus's release went through → case is complete as-is
- If the blast-radius scoring logic needs fixing → click **"Open Change Request"** in case actions
  - Title: "False positive threshold too sensitive for internal struct renames"
  - Type: Bug, Priority: Medium

🔵 **3. Close the case** if resolution confirmed.

**Expected total time:** 5 min.

---

### DG-02 · Compliance Export Broken Before Audit · `awaiting-lead`

**Auto result:** ✅ Critical severity, awaiting-lead, draft held by `force_draft_only_critical_escalation` gate. 1 KB evidence ref.

**Group B steps — what you need to do:**

🔵 **1. Open the case**
- URL: `http://localhost:3002/p/docugardener/cases`
- Case: "URGENT - Compliance export not working for SOC2 audit deadline TOMORROW"

🔵 **2. Review the draft reply in EmailReplyPanel**
- Scroll to the bottom of the case detail — the `EmailReplyPanel` should be visible (status = `awaiting-lead`)
- Read the AI draft: does it acknowledge the urgency (SOC2 audit Monday)?
- Does it offer a workaround (e.g. manual query via API, partial export, direct DB snapshot)?
- If draft is helpful: edit for tone, add ETA → click **Send Reply**
- If draft is inadequate: rewrite manually in the panel → Send

🔵 **3. Verify email delivery**
- Check your inbox (`alexeykopachev47@gmail.com`) — the Resend sandbox restriction means you'll only receive it at your own address
- In production: verify delivery to `sarah.chen@medcore.io`

🔵 **4. Create a bug CR for the export timeout**
- In case actions: **"Open Change Request"**
- Title: "Compliance export PDF times out for large repos (>800 PRs)"
- Type: Bug, Priority: Critical (audit deadline)
- Assign to engineering

🔵 **5. Do NOT resolve the case yet** — keep it `awaiting-lead` until Sarah confirms the workaround worked or the CR fix is deployed

**Expected total time:** 15–20 min.

---

### DG-03 · Nightly Rollup Config · `awaiting-lead`

**Auto result:** ⚠️ Confidence exactly 0.80 hit gate1 boundary (needs > 0.80). Case stayed `awaiting-lead` instead of auto-resolving. KB evidence retrieved.

**Group B steps — what you need to do:**

🔵 **1. Open the case**
- Case: "Nightly rollup creating 8+ separate issues — can we consolidate?"

🔵 **2. Review the EmailReplyPanel draft**
- The AI generated a draft with confidence 0.80 (blocked by gate)
- Check draft quality: does it explain how to configure the rollup consolidation setting?
- If good: click **Send Reply** to deliver to Priya (priya@scaleup.io)

🔵 **3. Resolve the case**
- After sending, click **Resolve** in case actions

🔵 **4. Note for backlog:** Gate1 threshold is `> 0.80` (strict). Confidence of exactly 0.80 fails.
This means many high-quality replies are being unnecessarily held. Consider changing to `>= 0.80`.
→ Already logged in backlog as BEF-03.

**Note for DG-09:** DG-09 requires this case to auto-resolve with `ai_resolved = true`. Since it didn't, DG-09 is blocked until the `ai_resolved` field is implemented. Skip DG-09 for now.

**Expected total time:** 5 min.

---

### DG-04 · Drift Score Inconsistency · `in-change`

**Auto result:** ✅ High severity, KB embedding evidence retrieved, case moved to `in-change` (CR was auto-created).

**Group B steps — what you need to do:**

🔵 **1. Check the Change Request**
- Go to `http://localhost:3002/p/docugardener/approvals`
- Find the CR related to DG-04 (embedding refresh / drift score inconsistency)
- Review: does the CR describe the problem accurately? Is the scope right?

🔵 **2. Approve or revise the CR**
- If scope is correct: click **Approve** (or **Request Changes** if not)
- Add any context from the case signals (embedding cache stale after >7 days, etc.)

🔵 **3. Check GitHub reply**
- In the DG-04 case detail, verify an outbound signal to GitHub exists
- If auto-reply posted correctly: no action needed
- If not: manually draft a reply from the case view referencing the embedding refresh schedule

🔵 **4. Track CR to completion**
- The case stays `in-change` until the CR is merged/closed. You don't need to resolve it today.

**Expected total time:** 10 min.

---

### DG-05 · Billing Dispute · `resolved`

**Auto result:** ⚠️ Auto-resolved with confidence 0.9. The billing/forbidden-phrase gate did NOT fire (expected to hold this for Lead review). Labels correct (`billing`, `upgrade`, `pro-rata`).

**Group B steps — what you need to do:**

🔵 **1. Open the case and review the resolution**
- Case: "Billing question" / upgrade or pro-rata inquiry
- Check what the AI replied: was the answer factually correct about your billing policy?
- Was any refund language used? (If yes, the forbidden-phrase gate should have fired — this is a bug)

🔵 **2. Quality check the auto-reply**
- If the AI gave a correct, policy-compliant answer: case is complete ✅
- If the reply made any commitment about refunds or credits not in policy: you need to send a correction email manually

🔵 **3. Stripe check (optional)**
- If the case involved an actual billing discrepancy, check Stripe dashboard for the customer's subscription
- The AI cannot access Stripe — any billing action must be done by you manually

🔵 **4. Note for backlog:** Forbidden-phrase gate (refund/billing) did not fire. Either the gate regex doesn't match this content, or the gate is only applied during auto-send (not pre-triage). → Logged as BEF-04.

**Expected total time:** 5 min.

---

### DG-06 · Setup Crash · `awaiting-lead`

**Auto result:** ⚠️ Severity over-classified as `high` (expected `normal`). Labels correct (setup wizard, crash, GitHub integration). No KB evidence retrieved (empty refs).

**Group B steps — what you need to do:**

🔵 **1. Open the case**
- Case: Setup wizard crash / GitHub App pagination issue for large organizations

🔵 **2. Add context manually (KB evidence missing)**
- The AI didn't surface the setup wizard troubleshooting article — no KB evidence was retrieved
- In the case view, you are the context source: the issue is likely a pagination problem when loading large organization GitHub App installations (>50 repos)
- Manually write or paste relevant context into the case notes

🔵 **3. Review/edit the EmailReplyPanel draft**
- The AI should have a draft (case is `awaiting-lead`)
- Does it acknowledge the crash and offer a workaround? (Clear cache, use a different browser, try the GitHub App re-install flow)
- Edit the draft if needed → Send

🔵 **4. Create a bug CR**
- This is a product defect (pagination crash in setup wizard)
- Open CR: "Setup wizard crashes when loading GitHub App for large orgs (>50 repos)"
- Type: Bug, Priority: High, Link to case

🔵 **5. Note for backlog:** Severity `high` instead of `normal` (stack trace/crash context triggers over-escalation). KB retrieval missed setup-wizard article. → Logged as BEF-05, BEF-06.

**Expected total time:** 15 min.

---

### DG-07 · Chat Widget OAuth Issue · `resolved`

**Auto result:** ✅ Chat signal correctly ingested, labels correct (oauth, github enterprise, insufficient scope), auto-resolved.

**Group B steps — what you need to do:**

🔵 **1. Verify the chat widget in browser**
- Open `http://localhost:3002/p/docugardener/cases`
- Navigate to Live Chats tab (if available) or find the chat case in the cases list
- Confirm the conversation thread is visible in the case detail

🔵 **2. Verify SSE push (visual)**
- If the chat was active when the signal was injected, the browser should have received a real-time SSE event pushing the case update without a page refresh
- Open DevTools → Network → EventSource — verify the SSE connection exists and events are flowing
- This is a visual-only check; no action required

🔵 **3. Check the auto-reply**
- Review the resolved case: what reply was sent to the chat user?
- Was the OAuth scope fix advice correct? (The user needed `repo` + `admin:org` scopes for GHE)

**Expected total time:** 5 min (mainly browser verification).

---

### DG-08 · Enterprise Sales Inquiry · `resolved`

**Auto result:** ✅ Dedup correctly prevented re-injection. Existing case from prior session correctly classified (low severity, pre-sales labels).

**Group B steps — what you need to do:**

🔵 **1. Confirm prior case handling**
- Find case: Jennifer Walsh enterprise inquiry (j.walsh@bigcorp.com)
- Was a proper sales response sent? (SOC2, on-premise, custom SLA)
- If not yet handled: draft a response addressing: compliance certifications, on-premise pricing, SLA tiers
- Forward to your sales workflow if applicable

🔵 **2. No new action required today** — this case was deduped and handled in a prior session.

**Expected total time:** 2 min.

---

### DG-09 · Knowledge Capture After AI Resolution · `BLOCKED`

**Auto result:** ⏭ SKIP — `ai_resolved` field not implemented in schema; `knowledge-capture` pg-boss job never dispatched.

**Group B steps:** None — blocked by system implementation gap.

**What needs to happen first:**
1. `ai_resolved` boolean needs to be added to `cases` table (or `triage_output.aiResolved` populated for auto-resolved cases)
2. `knowledge-capture` pg-boss job needs to be wired up in the agent pipeline
3. Re-run DG-03 and wait for auto-resolution, then re-run DG-09 assertions

→ Logged in backlog as BEF-01, BEF-02.

---

### SS-01 · Credential Not in Vault · `awaiting-lead`

**Auto result:** ✅ High severity, awaiting-lead, draft generated, BullMQ KB evidence refs present.

**Group B steps — what you need to do:**

🔵 **1. Open the case**
- URL: `http://localhost:3002/p/skillseal/cases`
- Case: credential-claim failure, vault-empty, BullMQ stuck

🔵 **2. Review the EmailReplyPanel draft**
- Does the AI draft reference the BullMQ troubleshooting steps? (flush stuck job, restart worker, check Redis connection)
- Does it explain the claim pipeline prerequisites?
- Edit for tone and specifics → **Send Reply** to the customer

🔵 **3. Monitor credential resolution**
- This is a SkillSeal-side infrastructure issue (BullMQ worker stuck)
- After sending the reply: monitor the case for a follow-up from the customer confirming resolution
- If they confirm the fix worked: click **Resolve**

🔵 **4. Consider a preventive CR**
- If the vault-empty state is a known recurring issue: create a CR for "Add vault pre-check to claim pipeline startup"

**Expected total time:** 10 min.

---

### SS-02 · Webhook Regression · `resolved`

**Auto result:** ⚠️ Auto-resolved (expected `awaiting-lead`). Severity `high` (expected `critical`). Notifications fired (2 records). Type `user_request` (expected `bug_report`).

**Group B steps — what you need to do:**

🔵 **1. Review the auto-resolution**
- Open case: webhook regression, enterprise plan, v2.1.0 issue
- Was the auto-reply correct? For a breaking API change affecting 200+ deliveries, the AI should NOT have auto-resolved — this needed a hotfix CR and webhook replay
- If the reply was inadequate: send a manual follow-up acknowledging the breaking change and committing to a hotfix timeline

🔵 **2. Create a hotfix CR manually**
- Click **Open Change Request** in case actions
- Title: "Webhook payload breaking change in v2.1.0 — restore backward compat"
- Type: Bug, Priority: Critical
- Assign to engineering for immediate hotfix

🔵 **3. Create a second CR for webhook replay**
- Title: "Replay 200+ failed webhook deliveries for enterprise customers on v2.1.0"
- Type: Task, Priority: High
- This is a SkillSeal backend operation — NestFleet tracks it, SkillSeal executes it

🔵 **4. Note for backlog:** Critical webhook regression scored as `high/user_request` instead of `critical/bug_report`. → Logged as BEF-07.

**Expected total time:** 15 min.

---

### SS-03 · ZK Proof Timeout · `resolved`

**Auto result:** ⚠️ KB evidence retrieved (ZK batch limits). Severity `normal` (expected `high`). Auto-resolved (Path A).

**Group B steps — what you need to do:**

🔵 **1. Review the auto-resolution quality**
- Open case: ZK proof timeout, batch verification
- Did the AI draft reference the ZK batch size limits KB article? (reduce batch size from 1000 → 100 for Groth16)
- Was the workaround correct and actionable?

🔵 **2. Check the sidecar CR (infra debt)**
- SS-03 is configured to auto-create an infra-debt sidecar CR (`shouldCreateSidecarCr()` predicate)
- Go to `http://localhost:3002/p/skillseal/approvals`
- There should be a CR with `cr_track: "infra_debt"` and an orange **Infra Debt** badge
- Review it: does it describe the ZK batch limit architectural issue correctly?

🔵 **3. If no sidecar CR exists** (it may not have fired due to `resolved` status):
- Manually create one: "ZK proof batch size limit — refactor to chunk verification jobs"
- Mark as Infra Debt track

🔵 **4. Note for backlog:** ZK timeout severity under-classified as `normal` instead of `high`. → Logged as BEF-07.

**Expected total time:** 10 min.

---

### SS-04 · DID Domain Migration · `resolved`

**Auto result:** ✅ Auto-resolved, DID migration KB evidence retrieved.

**Group B steps — what you need to do:**

🔵 **1. Verify email delivery to James**
- Open case: DID domain migration issue
- Check that an outbound reply signal exists (Timeline tab)
- In sandbox: reply went to your email, not James's. In production: verify `james@...` received the DID migration guide
- Content should explain: update did:web domain, regenerate DID document, re-verify anchoring

🔵 **2. Confirm case resolution is accurate**
- DID migration is a user-side operation — once instructions are sent, case should be resolved
- Case is already `resolved` ✅

**Expected total time:** 3 min.

---

### SS-05 · Meta-Skill Composite (Sensitivity Gate) · `resolved`

**Auto result:** ⚠️ Auto-resolved (expected `awaiting-lead`). Sensitivity/empathy gate did NOT fire. Labels correct (meta-skills, talent-pro). Severity `normal`.

**Group B steps — what you need to do:**

🔵 **1. Review the auto-reply content critically**
- Open case: meta-skill synthesis error, talent-pro issue, potential career harm
- Read the AI reply carefully: is it empathetic? Does it acknowledge the career impact angle?
- This scenario involves potential reputation/professional harm — the reply must not be tone-deaf or dismissive

🔵 **2. Send a follow-up if needed**
- If the auto-reply was technically correct but lacked empathy: send a manual follow-up acknowledging the impact
- Template: acknowledge frustration, explain what happened, commit to a review of the synthesis logic

🔵 **3. Consider a CR for synthesis logic review**
- If meta-skill scoring logic was genuinely wrong: Open CR "Review Meta-Skill synthesis criteria — talent-pro edge case"

🔵 **4. Note for backlog:** Sensitivity gate (empathy hold) did not fire for a case involving potential career harm. → Logged as BEF-08.

**Expected total time:** 10 min.

---

### SS-06 · Batch Verification API 500 · `resolved`

**Auto result:** ⚠️ Notifications fired (2). Severity `high` (expected `critical`). Auto-resolved (expected `awaiting-lead`). Outage routing job NOT dispatched.

**Group B steps — what you need to do:**

🔵 **1. Review the auto-resolution — this should not have been auto-resolved**
- Open case: batch verification API 500 outage
- An API outage affecting batch verification is a critical infrastructure event, not a resolvable FAQ case
- Read the AI reply: was it appropriate? (It probably said "retry later" or referenced the API docs)
- Send a manual follow-up: acknowledge the outage, provide status page link, commit to SLA

🔵 **2. Create outage CR manually (outage routing didn't fire)**
- Click **Open Change Request** in case actions
- Title: "Batch Verification API returning 500 — production outage"
- Type: Outage/Bug, Priority: Critical
- Assign to on-call engineer immediately

🔵 **3. Escalate via Slack/email**
- Notify engineering team of the outage (outside NestFleet — Slack, PagerDuty, etc.)
- NestFleet should have auto-dispatched an `outage-routing` job but didn't (see BEF-09)

🔵 **4. Note for backlog:** `outage-routing` pg-boss job never dispatched for outage scenarios. → Logged as BEF-09.

**Expected total time:** 15 min.

---

### SS-07 · Chat Widget ZK Proof · `resolved`

**Auto result:** ⚠️ Chat signal correctly ingested from mobile. Labels correct (mobile, zk-proof, safari, chrome). Severity `normal` (expected `high`). Auto-resolved (expected `awaiting-lead`).

**Group B steps — what you need to do:**

🔵 **1. Open browser chat widget**
- Open `http://localhost:3002/p/skillseal/cases` → Live Chats tab
- Verify the chat session is visible and the conversation is intact
- Check if the AI reply in chat was delivered via SSE push (real-time, without page refresh)

🔵 **2. Verify SSE push**
- Open DevTools → Network → EventSource
- Confirm SSE connection exists and a `case:updated` or chat event was received when the case was resolved

🔵 **3. Assess auto-resolution quality**
- ZK proof failures on mobile Safari/Chrome are infrastructure-level issues, not FAQ answers
- If the AI reply was insufficient: use the case view to send an operator reply through the chat channel
- The customer should receive it in their open chat widget session

🔵 **4. Note for backlog:** Mobile ZK proof failure (high impact) scored as `normal`. → Logged as BEF-07 (same severity pattern).

**Expected total time:** 8 min.

---

### SS-08 · Blockchain Anchor Failure · `awaiting-lead`

**Auto result:** ⚠️ Critical severity ✅. Type `user_request` (expected `outage_report`). Status `awaiting-lead` ✅. Outage routing job NOT dispatched.

**Group B steps — what you need to do:**

🔵 **1. Open the case — this is urgent**
- Case: "ALERT: Blockchain anchor failure rate > 50%" (monitoring alert)
- This is a production outage requiring immediate engineering action

🔵 **2. Review the EmailReplyPanel draft**
- Does the AI draft acknowledge the severity correctly?
- It should reference the anchor retry policy KB article (exponential backoff, manual re-anchor steps)

🔵 **3. Create outage CR immediately (outage routing didn't auto-fire)**
- Click **Open Change Request**
- Title: "Blockchain anchor service failure > 50% — production incident"
- Type: Bug/Outage, Priority: Critical
- Assign to on-call / infrastructure lead

🔵 **4. Escalate outside NestFleet**
- Page on-call engineer
- Create a status page incident
- NestFleet should have auto-dispatched `outage-routing` job but didn't — this is a system gap (BEF-09)

🔵 **5. Send acknowledgment reply** (to monitoring system or internal team)
- Click **Send Reply** in EmailReplyPanel → sends internal acknowledgment

🔵 **6. Resolve case only after incident is mitigated**

**Expected total time:** 20 min.

---

### SS-09 · OU Limit Enforcement · `BLOCKED`

**Auto result:** ⏭ SKIP — SS-09 not in inject-signals.ts; OU limit setup SQL doesn't match `outcome_unit_usage` schema.

**Group B steps:** None — blocked.

**What needs to happen first:**
1. Add SS-09 scenario to inject-signals.ts
2. Update setup SQL to match `outcome_unit_usage` table schema (no `period_start`/`ou_used`/`ou_limit` columns)
3. Implement OU limit enforcement logic that reads from `outcome_unit_usage`

→ Logged as BEF-10.

---

### XP-01 · Bridge Event Doc Drift · `BLOCKED`

**Auto result:** ⏭ SKIP — `POST /api/v1/bridge/event` returns 404 (not implemented).

**Group B steps:** None — blocked.

**What needs to happen first:**
1. Implement `/api/v1/bridge/event` endpoint
2. Wire bridge event routing to create cases in the target product

→ Logged as BEF-11.

---

### XP-02 · Cross-Product Identity · created ✅

**Auto result:** ✅ Identity created for SkillSeal, cross-product dedup confirmed (2 products, 1 email).

**Group B steps — what you need to do:**

🔵 **1. Verify identity linking in Console**
- Open `http://localhost:3002/p/skillseal/cases`
- Find the XP-02 case
- In case detail → Identity panel: should show `sarah.chen@medcore.io` with a link to her DG identity
- Check if the cross-product signal history is visible (DG-02 history should show as context)

🔵 **2. Check Lineage Graph (Group B)**
- Navigate to the XP-02 case → Lineage tab
- A cross-product link should appear connecting the SkillSeal case to the DG-02 case via sarah.chen identity

**Expected total time:** 5 min.

---

## Summary — What's Left for You to Do

### Immediate (cases in `awaiting-lead` — need your action today):

| Case | Action |
|------|--------|
| DG-02 | Review draft → Send → Create export bug CR |
| DG-03 | Review draft → Send → Resolve |
| SS-01 | Review draft → Send → Monitor credential resolution |
| SS-08 | Create outage CR → Escalate → Send ack → Track to resolution |

### Review Required (auto-resolved, quality uncertain):

| Case | Action |
|------|--------|
| DG-05 | Check billing reply was policy-compliant |
| SS-02 | Create hotfix CR + webhook replay CR (auto-resolution was wrong) |
| SS-06 | Create outage CR manually (outage routing missed) |
| SS-05 | Check empathy quality; send follow-up if tone was off |

### Visual Verification (Group B browser checks):

| Case | Action |
|------|--------|
| DG-07 | Open Live Chats tab, verify SSE in DevTools |
| SS-07 | Open Live Chats tab, verify SSE + mobile chat reply |
| XP-02 | Verify identity cross-product link in Console |

### Already Complete:

| Case | Status |
|------|--------|
| DG-01 | Resolved + auto-replied. Optionally assess CR need. |
| DG-04 | In-change. Review CR in Approvals. |
| DG-08 | Complete from prior session. |
| SS-04 | Auto-resolved correctly. Verify email delivery. |
| XP-02 | Identity dedup confirmed. Visual check optional. |

### Blocked (system bugs — no manual workaround):

| Case | Blocked By |
|------|------------|
| DG-09 | `ai_resolved` field + `knowledge-capture` job not implemented (BEF-01/02) |
| SS-09 | SS-09 not in inject-signals.ts + schema mismatch (BEF-10) |
| XP-01 | Bridge event endpoint not implemented (BEF-11) |
