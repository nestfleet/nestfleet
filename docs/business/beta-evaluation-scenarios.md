# NestFleet Beta Evaluation — Real-World Scenarios

> **Purpose:** Structured beta evaluation of NestFleet against real support operations for DocuGardener and SkillSeal.
> Each scenario is grounded in actual product workflows. Pass each through NestFleet end-to-end and evaluate efficiency, friction, and added value at every step.
>
> **Channels in scope:** Email, GitHub webhooks, Chat Widget, Contact Form, Bridge Event, Scheduled/Monitoring
> **Channels deferred:** Slack inbound (outbound-only today — see PO Review §B1)
> **Team setup:** 1 Operator (frontline), 1 Support Lead (escalations + final decisions)
> **Products:** DocuGardener (9 scenarios) · SkillSeal (9 scenarios) · Cross-product (3 scenarios)
> **Date:** 2026-03-20 · **Revised:** 2026-03-23 (post-v1.5 feature audit — B2 resolved, B2a resolved, 3 new scenarios added, DEFERRED-24 email composer integrated)

---

## PO Review — Blockers & Mitigations (2026-03-20)

### B1 — Slack inbound does not exist

**Status:** CONFIRMED. `SignalSourceTypeSchema` has no `"slack"` value. No `src/api/webhooks/slack.ts`. DEFERRED-12 is outbound-only (notifications).

**Mitigation:** DG-03 and SS-03 are re-channeled to **email** for this evaluation round. The scenario personas and signal content stay identical — only the delivery channel changes. This tests the same triage/AI/routing logic. A post-eval backlog item tracks Slack inbound as a future channel (DEFERRED-XX).

**Residual risk:** Zero — email exercises the same pipeline. Slack-specific evaluation (thread reply attribution, @mention detection) is deferred to when the channel ships.

### B2 — GitHub issue auto-reply not wired → ✅ RESOLVED 2026-03-21

**Status:** ~~CONFIRMED~~ **RESOLVED.** DEFERRED-22 shipped: `AutoReplyWorker` now calls `addIssueComment()` on `cases.github_issue_ref` when `autoSend=true`. `DisclosureChannel` extended with `"github"`. 10 unit tests (NF-UNIT-440..449).

**Impact on scenarios:** DG-01, DG-04, DG-06 checkpoints updated — auto-reply can now post directly to GitHub issues when confidence gates pass. If gates don't pass, the draft remains in case view for operator review and manual posting.

**Original mitigation (no longer needed):**
- ~~"Does NestFleet draft a relevant reply in the case view that an operator could post to GitHub?"~~
- → Now: "Does NestFleet auto-post to the GitHub issue (if gates pass) or draft a reply for operator review (if not)?"

### B2a — Email reply composer not implemented → ✅ RESOLVED 2026-03-23

**Status:** ~~CONFIRMED~~ **RESOLVED.** DEFERRED-24 shipped: `AutoReplyWorker` now persists draft to `cases.draft_reply` + `cases.draft_metadata` when validation gates fail. New `POST /cases/:caseId/send-draft-reply` endpoint (requires `support_lead` role). Console `EmailReplyPanel` component renders editable draft in case detail when status is `awaiting-lead` and case originated from email. Sending clears draft, sends email via `sendEmail()`, case stays in `awaiting-lead` (operator resolves separately).

**Impact on scenarios:** 9 email-based scenarios updated — SS-01, DG-02, DG-03, DG-05, SS-03, SS-04, SS-05, SS-06, DG-08. Each now includes `[DEFERRED-24]` checkpoints for draft visibility, edit capability, send-and-stay behavior, and email delivery verification.

**Key behavior:** Sending a reply does NOT auto-resolve the case. The Lead retains full control of case lifecycle. This is by design — the reply is an action, not a resolution signal.

### B3 — KB must be pre-populated before any scenario runs

**Status:** CONFIRMED. The auto_reply agent requires Tier 1 sources (`sourceTiers.includes(1)`) to auto-send. Without KB articles, every scenario produces `requiresHumanReview: true` → `awaiting-lead`. The evaluation would measure "NestFleet without KB" rather than "NestFleet as intended."

**Mitigation:** `scripts/beta-eval/seed-knowledge.ts` seeds 16 KB articles (7 DG + 9 SS) as Tier 1 memory chunks with embeddings. **Hard prerequisite:** no scenario runs until `seed-knowledge.ts` completes successfully and Console → Knowledge tab shows entries for both products.

Each scenario now lists its **required KB articles** in a prerequisites block.

### G1 — Triage severity calibration may not match scenario expectations

**Status:** ACKNOWLEDGED. The triage prompt defines Critical as "service down, data loss, security breach, blocking all users." DG-02 (one user's export broken) and SS-05 (career harm from AI error) may triage as High, not Critical.

**Mitigation:** Scenario expectations are revised to reflect the triage prompt's actual decision rules:
- DG-02: Expected severity changed from Critical → **High** (single user blocked, not all users). If NestFleet returns Critical, that's a bonus — record as ✅.
- SS-05: Expected severity changed from Medium→High → **Medium** (single user, no data loss, no security breach). Reputation/legal risk is not currently an escalation signal.

These calibration findings become **triage prompt tuning items** post-eval, not NestFleet failures.

### G2 — Product-specific operational hints require KB, not NestFleet magic

**Status:** ACKNOWLEDGED. NestFleet has no connection to SkillSeal's BullMQ or Groth16 workers. "Check BullMQ queue" can only surface if it's in the KB.

**Mitigation:** Checkpoints reframed from "does NestFleet surface this?" to:
- "Does the KB article content surface in the AI reply or case context?"
- "Does the operator have enough context from NestFleet's case view to investigate product-side infrastructure separately?"

The seeded KB articles for SS-01 and SS-03 explicitly include BullMQ troubleshooting and ZK batch limit details, so the AI *should* reference them. If it doesn't, that's a genuine retrieval quality issue worth documenting.

### G3 — SS-02 webhook replay is not a NestFleet operation

**Status:** ACKNOWLEDGED. NestFleet can create a CR for "replay failed webhooks" but cannot verify completion. Webhook replay is a SkillSeal backend operation.

**Mitigation:** SS-02 expected outcome revised:
- ~~"All 200+ deliveries replayed and confirmed"~~
- → "CR created for hotfix + separate CR/action item created for webhook replay. Case remains open until operator manually confirms Viktor's replay completion. NestFleet tracks the work; SkillSeal executes it."

---

## Execution Prerequisites

### Instance configuration

| Requirement | Detail |
|-------------|--------|
| **NestFleet instance** | Local dev (`localhost:3001` backend, `localhost:3002` console) |
| **PlatformCloud** | `localhost:4000` — required for license control (`tsx watch src/index.ts` in `PlatformCloud/`) |
| **License mode** | Dev mode (no `LICENSE_KEY` in `.env`) → Scale tier, all features enabled |
| **Products** | DocuGardener + SkillSeal created and both assigned to the operator user in `operator_users.product_ids` |
| **LLM config** | Both products: Google/Gemini key in `products.llm_config.apiKey` (DB) |
| **KB baseline** | `scripts/beta-eval/seed-knowledge.ts` run successfully for both products. Verify via Console → Knowledge → Sources tab (WAVE 5) and Health panel coverage. |
| **GitHub repo** | Connected for DG (alexey-kopachev/docugardener) and SS (alexey-kopachev/skillseal) |
| **Product switcher** | DEFERRED-21 shipped — use sidebar switcher or Cmd+K palette to switch between products. No env-var restart needed. |

> **DEFERRED-21 (multi-product console) is now live.** The Console URL structure has changed:
> - **Old:** `http://localhost:3002/cases` (single-product, env-var driven)
> - **New:** `http://localhost:3002/p/docugardener/cases` and `http://localhost:3002/p/skillseal/cases`
>
> After login the browser redirects automatically to `/p/docugardener/cases` (first product).
> Use the **product switcher** (top of the left sidebar) or **Cmd+K** to switch between DocuGardener and SkillSeal.
> All links within the Console (case rows, approval rows, queue items) now navigate to product-scoped URLs.
> Legacy `/cases`, `/approvals`, etc. still work but redirect to the appropriate `/p/[slug]/` route when `nf_last_product` cookie is set.

### Role assignments (solo operator mode)

| Role | Person | Responsibility |
|------|--------|---------------|
| **Customer** | Injection script | Simulates inbound signals via `inject-signals.ts` |
| **Operator** | Alexey | Monitors Console → Cases, reviews AI drafts, takes actions |
| **Support Lead** | Alexey | Handles escalations, approves CRs, makes judgment calls |

### Per-scenario KB requirements

| Scenario | Required KB Articles | Seed Script Chunk IDs |
|----------|---------------------|-----------------------|
| DG-01 | .docuignore config, blast radius scoring | `mc_beta_dg_docuignore`, `mc_beta_dg_blast_radius` |
| DG-02 | (none — escalation scenario, no AI fix expected) | — |
| DG-03 | Nightly rollup configuration | `mc_beta_dg_nightly_rollup` |
| DG-04 | Embedding refresh triggers | `mc_beta_dg_embedding_refresh` |
| DG-05 | Upgrade billing policy | `mc_beta_dg_billing` |
| DG-06 | (none — bug report, no KB fix expected) | — |
| DG-07 | GHE OAuth scopes | `mc_beta_dg_ghe_oauth` |
| DG-08 | (none — sales inquiry, human routing) | — |
| SS-01 | Claim pipeline, BullMQ troubleshooting | `mc_beta_ss_claim_pipeline`, `mc_beta_ss_bullmq_troubleshooting` |
| SS-02 | Webhook payload changelog | `mc_beta_ss_webhook_changelog` |
| SS-03 | ZK batch size limits | `mc_beta_ss_zk_batch_limits` |
| SS-04 | DID domain migration | `mc_beta_ss_did_migration` |
| SS-05 | Meta-Skill synthesis criteria | `mc_beta_ss_metaskill_synthesis` |
| SS-06 | Batch verification API reference | `mc_beta_ss_batch_verify_api` |
| SS-07 | Mobile wallet compatibility | `mc_beta_ss_mobile_wallet` |
| SS-08 | Blockchain anchor retry policy | `mc_beta_ss_anchor_retry` |
| XP-01 | AI Author safety controls | `mc_beta_dg_ai_author` |
| XP-02 | (none — identity test) | — |
| DG-09 | (none — tests post-resolution knowledge extraction from DG-03) | — |
| SS-09 | (none — tests OU limit enforcement, not KB) | — |
| XP-03 | Credential revocation propagation (uploaded during test) | Operator uploads manually via Console |

### Grading criteria — quantitative definitions

| Grade | Criteria |
|-------|----------|
| **✅ Pass** | NestFleet completed the step correctly, with no manual intervention, in <2 minutes. AI response is relevant and actionable. |
| **⚠️ Partial** | Step completed but: wrong severity (off by 1 level), required manual override, AI response was generic/unhelpful, or took >5 minutes. |
| **❌ Fail** | Step blocked entirely, data lost, wrong routing (e.g. billing → engineering), AI response harmful/misleading, or NestFleet added no value over a spreadsheet. |

---

## Suggested Run Order

Run easy scenarios first to validate the pipeline, then escalate to complex ones.

**Phase A — Pipeline validation (basic email + GitHub):**
1. **DG-05** (billing question, low risk, email, tests basic triage + AI KB match)
2. **SS-04** (DNS config question, email, tests AI KB full answer — "fully AI-resolvable")
3. **DG-01** (GitHub false positive, tests triage + CR creation)

**Phase B — Complex routing + escalation:**
4. **DG-04** (GitHub RAG inconsistency, tests known-issue match)
5. **SS-01** (credential vault, email, tests AI + operator monitor)
6. **DG-02** (critical export failure, email, tests lead escalation)
7. **SS-05** (reputation risk, email, tests sensitive case handling)

**Phase C — Full agent pipeline:**
8. **DG-06** (GitHub setup crash, tests CR creation for product bug)
9. **SS-02** (critical regression, GitHub, tests CR → PR draft → hotfix flow)
10. **SS-06** (critical API, email, tests outage routing)
11. **SS-08** (monitoring alert, scheduled, tests infrastructure triage)

**Phase D — Extended channels + cross-product:**
12. **DG-07** (chat widget, tests chat ingress + AI deflection + SSE push + Live Chats tab)
13. **DG-08** (contact form, tests sales routing)
14. **SS-07** (chat widget, tests escalation from chat + operator reply via SSE)
15. **DG-03** (email — re-channeled from Slack, tests "fully AI-resolvable")
16. **SS-03** (email — re-channeled from Slack, tests workaround + infra CR)
17. **XP-01** (bridge event, tests cross-product value)
18. **XP-02** (cross-product identity, tests identity linking — **requires DG-02 run first**)

**Phase E — System capabilities + learning loop:**
19. **DG-09** (knowledge capture, tests post-resolution FAQ extraction — **requires DG-03 resolved first**)
20. **XP-03** (memory ingest → retrieval, tests WAVE 5 upload → triage KB lookup)
21. **SS-09** (OU limit, tests graceful degradation at capacity — **requires OU mock setup**)

---

## Evaluation Framework

### Grading per step

| Grade | Meaning |
|-------|---------|
| ✅ Pass | NestFleet handled the step correctly and faster/better than manual |
| ⚠️ Partial | Worked but added friction, wrong classification, or required manual override |
| ❌ Fail | Blocked, lost data, wrong routing, or added no value over a spreadsheet |

### Value dimensions

- **V1 — Speed:** Time from signal to actionable outcome (triage, PR, resolution)
- **V2 — Accuracy:** Correct severity, routing, and change scope
- **V3 — Governance:** Audit trail, approval gates, policy enforcement
- **V4 — Deflection:** Cases auto-resolved or deflected by knowledge base
- **V5 — Cross-product:** Suite integration value (NestFleet ↔ DocuGardener bridge)

### How to run a scenario

1. Inject the signal via `scripts/beta-eval/inject-signals.ts --scenario <ID>` (or simulate the real channel)
2. Observe NestFleet: triage result, severity, AI response, case lifecycle
3. Perform operator actions (reply, escalate, create CR, resolve)
4. Record: time-to-triage, time-to-resolve, friction points, missing context, unnecessary steps
5. Rate every step: **✅ Pass / ⚠️ Partial / ❌ Fail**

---

## DocuGardener Scenarios

---

### DG-01 · "False Positive Blocks a Release" · GitHub · High Severity

**Persona:** Marcus, Senior Engineer at a FinTech startup (Team plan). Tech lead for a 6-person team. Non-customer-facing refactoring sprint.

**Trigger:**
Marcus opens a PR that renames internal service structs (`PaymentProcessor` → `PaymentEngine`). DocuGardener fires a drift check and blocks the PR merge with a 0.82 drift score, pointing to `docs/architecture.md`. The docs reference `PaymentProcessor` but this is an internal name, never exposed in the public API or user-facing docs. It is a false positive. Release is scheduled in 2 hours.

**Inbound signal — GitHub:**
```
Title: False positive blocking release — internal refactor flagged as doc drift
Body:
PR #412 blocked by drift check. Score 0.82 on docs/architecture.md.
Change is internal rename only — PaymentProcessor → PaymentEngine.
No public API surface changed. Release in 2h.
Repo: fintech-core, Branch: release/2.4.1
DocuGardener version: 1.3.2
```

**Expected NestFleet flow:**
1. GitHub webhook → Signal created (`source_type: github_webhook`)
2. Triage → Severity: **High** (release blocker + time constraint in body), Type: Bug / False Positive
3. Frontline AI searches KB → finds "configuring drift ignore rules" and "blast radius scoring" articles → drafts response with interim workaround (add `# dg-ignore` annotation or use `.docugardener.yml` ignore pattern)
4. If auto-send gates pass (confidence ≥ 0.85, T1 source): **auto-reply posted to GitHub issue** via `addIssueComment()`. If gates don't pass: operator reviews draft in case view → approves → reply posted.
5. If workaround resolves: case closed
6. If root cause needs fixing → Operator escalates to Lead → CR opened targeting the blast-radius scoring logic

**Features exercised:** GitHub ingress, AI triage, KB lookup, GitHub auto-reply (DEFERRED-22 ✅), Change Request flow

**Evaluation checkpoints:**
- Does triage correctly identify High severity from "release in 2h" context?
- Does AI find the right KB articles (ignore rules, blast radius config)?
- Does the case view provide enough context (repo, PR #, drift score) for the operator to act without context-switching?
- Does the auto-reply post to the GitHub issue thread (if gates pass), or draft a review-ready reply (if not)?
- Does the CR capture enough context for an engineer to reproduce?

> **Note (PO Review §B2):** ~~GitHub auto-reply not implemented~~ → **RESOLVED 2026-03-21.** `AutoReplyWorker` now posts to GitHub issues via `addIssueComment()` when `autoSend=true`.

**Expected outcome:** Workaround delivered within 15 min. Root cause tracked as CR. Release unblocked.

---

### DG-02 · "Evidence Export Broken Before Audit" · Email · High Severity (calibration note)

**Persona:** Sarah, Compliance Manager at a MedTech company (Team plan). Non-technical. Preparing for annual SOC2 Type II audit starting Monday. Today is Friday afternoon.

**Trigger:**
Sarah needs to export the compliance PDF proving all 847 merged PRs in the last 12 months had verified documentation. The "Export Compliance Report" button returns a loading spinner for 3 minutes then shows a generic error. She has a pre-audit review with auditors at 9am Monday.

**Inbound signal — Email:**
```
From: sarah.chen@medcore.io
To: support@docugardener.io
Subject: URGENT - Compliance export not working, audit Monday

Hi,

I need to export our compliance report urgently for our SOC2 audit on Monday morning.
When I click "Export Compliance Report" I get a loading spinner for a few minutes
then nothing happens. No download, no error message.

We have 847 PRs that need to be in this report covering Jan 2025 - now.
Is this a known issue? Is there a workaround?

Sarah Chen
Head of Compliance, MedCore Devices
```

**Expected NestFleet flow:**
1. Email ingress → Signal created
2. Triage → Severity: **High** (single user blocked, deadline pressure, "URGENT" in subject). Note: may triage as Critical — triage prompt defines Critical as "blocking all users" but the URGENT + audit deadline language may push it higher. Either High or Critical is acceptable here — see PO Review §G1.
3. Frontline AI: checks KB for known export issues → no match → drafts holding response: "We've flagged this as critical, an engineer will respond within 1 hour"
4. Auto-reply gates fail (no T1 KB match → low confidence) → case transitions to `awaiting-lead` with **draft saved to `cases.draft_reply`**
5. Operator receives notification → opens case → sees full email thread + triage summary + **EmailReplyPanel with AI draft**
6. Operator cannot resolve alone → **Escalates to Lead**
7. Lead investigates (likely: export job timeout for large datasets > 500 PRs, needs backend fix or chunked export workaround)
8. Lead edits draft in **EmailReplyPanel** → adds workaround (date-range chunking) → clicks **"Send Reply"** → email sent to Sarah
9. Case stays in `awaiting-lead` → Lead deploys fix → confirms resolution → resolves case
10. Audit trail preserved in NestFleet — the support interaction itself is evidence of responsiveness.

**Features exercised:** Email ingress, Critical severity escalation, Lead escalation flow, draft persistence (DEFERRED-24 ✅), EmailReplyPanel edit + send, email reply threading

**Evaluation checkpoints:**
- Does "URGENT" + named deadline reliably produce High or Critical severity? (High is the correct calibration per current triage rules — Critical is a bonus)
- Is the escalation-to-Lead UX fast enough for a time-sensitive case?
- **[DEFERRED-24]** Does the EmailReplyPanel show the AI holding response draft?
- **[DEFERRED-24]** Can the Lead edit the draft to add the workaround before sending?
- **[DEFERRED-24]** Does the reply email reach Sarah's thread with the correct From address?
- **[DEFERRED-24]** Does the case stay in `awaiting-lead` after send (not auto-resolve)?
- Is the audit trail of the support interaction itself accessible/exportable?

**Expected outcome:** Sarah gets a workaround before EOD Friday. Case closed before Monday. NestFleet interaction itself becomes part of the compliance story.

---

### DG-03 · "Nightly Issue Spam on Monorepo" · Email (re-channeled from Slack) · Low Severity

> **PO Review §B1:** Originally Slack-sourced. Re-channeled to email because Slack inbound ingestion is not implemented (outbound-only). The scenario content and evaluation criteria remain identical — only the delivery channel changes. When Slack inbound ships, re-run this scenario via Slack to test thread attribution and @mention detection.

**Persona:** Priya, Platform Engineer at a scale-up (Pro plan). Manages 12 repos in a monorepo. Responsible for CI/CD tooling.

**Trigger:**
Priya's GitHub inbox is flooded. The DocuGardener nightly rollup has been creating 8–12 GitHub issues per night for the past week, one per sub-package in the monorepo. She wants either a single consolidated issue per night or to suppress rollups for packages below a certain drift threshold.

**Inbound signal — Email:**
```
From: priya@scaleup.io
To: support@docugardener.io
Subject: Nightly rollup creating 8+ separate issues — can we consolidate?

Hi,

The nightly rollup is creating 8+ GitHub issues per night on our monorepo.
Is there a way to consolidate them into one issue or set a minimum drift
threshold before an issue gets created? Getting hard to manage.

We have 12 repos in a monorepo structure. Plan: Team ($79/mo).

Thanks,
Priya
```

**Expected NestFleet flow:**
1. Email ingress → Signal created (`source_type: email`)
2. Triage → Severity: **Low**, Type: Feature Request / Configuration Question
3. Frontline AI → searches KB for "nightly rollup configuration", "monorepo settings", `.docugardener.yml` reference → high confidence answer exists
4. AI drafts response with config options:
   - `rollup.consolidate: true` → single issue per repo
   - `rollup.minDriftScore: 0.4` → suppresses low-confidence items
5. **Path A — Auto-send (happy path):** All gates pass (confidence ≥ 0.85, T1 source, no human review flag, no forbidden phrases) → reply sent automatically to Priya's email → case auto-resolved (`ai_resolved: true`)
6. **Path B — Draft held (fallback):** Any gate fails → case transitions to `awaiting-lead` with **draft saved to `cases.draft_reply`** → Lead opens case → sees **EmailReplyPanel** with AI draft → reviews/edits → clicks **"Send Reply"** → email sent → Lead resolves manually

**Features exercised:** Email ingress, AI KB resolution, auto-reply (if gates pass), draft persistence + EmailReplyPanel (if gates fail, DEFERRED-24 ✅), auto-resolve or manual resolve

**Evaluation checkpoints:**
- Does AI response include the actual config YAML snippet (not just general advice)?
- Does auto-send fire (all gates met) or does it fall to `awaiting-lead`?
- **If Path A:** Does auto-close work cleanly? Is `ai_resolved: true` set?
- **If Path B [DEFERRED-24]:** Does the EmailReplyPanel show the draft? Can Lead send it? Does email reach Priya?
- Does auto-close work cleanly?

**Expected outcome:** Fully AI-handled if auto-send gates pass (Path A). If gates fail, Lead reviews and sends in <2 min (Path B). Either way: resolution in under 5 minutes with minimal operator effort.

**Note:** This scenario directly tests whether NestFleet can handle Tier-1 config questions without operator involvement — the most important efficiency multiplier. Path B (draft held) still demonstrates value: the AI did the work, the Lead just approves.

---

### DG-04 · "Drift Score Inconsistency Across Branches" · GitHub · Medium Severity

**Persona:** Daniel, Senior Backend Developer (Team plan). Has been using DocuGardener for 6 months, understands the product well.

**Trigger:**
Daniel notices that the exact same PR diff (rebased identically) gets a drift score of 0.31 on `main` but 0.79 on `release/3.0`. He suspects the RAG context retrieved for each branch is different because the release branch has older embeddings from a doc snapshot taken 3 months ago. He opens a detailed GitHub issue with repro steps.

**Inbound signal — GitHub:**
```
Title: Inconsistent drift scores between branches — suspected stale embeddings on release branch
Body:
Steps to reproduce:
1. Create branch from main, make change to src/api/handlers.go
2. Check drift score against main → 0.31 (correctly low)
3. Cherry-pick same commit to release/3.0 → drift score 0.79 (incorrectly high)

Hypothesis: release/3.0 was branched 3 months ago. Embeddings for docs/ may not
have been refreshed since branch was created. The RAG context is retrieving
outdated doc snapshots.

Expected: Same change → same score regardless of branch
Actual: Different scores, leading to PR being blocked on release branch

Repo: backend-services
DocuGardener version: 1.3.2
```

**Expected NestFleet flow:**
1. GitHub webhook → Signal
2. Triage → Severity: **Medium**, Type: Bug / RAG / Embeddings
3. Frontline AI: searches KB → partial match on "embedding refresh" → low confidence → drafts partial response acknowledging the hypothesis + asks for additional info (branch creation date, last embedding refresh timestamp from settings)
4. If confidence gates pass: reply posted to GitHub issue via `addIssueComment()`. More likely: low confidence → operator reviews draft → approves → reply posted to GitHub.
5. Case transitions to `in-resolution` → Operator creates **Change Request** for engineering: "investigate per-branch embedding staleness; add branch creation date to embedding refresh trigger"
6. CR linked to GitHub PR in DocuGardener repo

**Features exercised:** GitHub ingress, partial AI response, GitHub reply (auto or operator-approved), CR creation, CR-to-GitHub link

**Evaluation checkpoints:**
- Does the AI correctly flag low confidence and ask for clarifying info rather than hallucinating an answer?
- Does the case view provide enough context (repo, branch names, scores) for the operator to act?
- Is the CR creation UX efficient for the operator (does it carry context from the case)?
- Does the GitHub reply (auto or operator-approved) land on the correct issue thread?

> **Note:** PO Review §B2 resolved — GitHub auto-reply now operational.

**Expected outcome:** Daniel gets acknowledgment + workaround (manual re-index trigger) within 30 min. Fix tracked as CR. Closed within sprint.

---

### DG-05 · "Pro-Rata Billing Dispute" · Email · Low Severity

**Persona:** Raj, Engineering Manager (upgraded from Pro to Team plan mid-month). Manages a 15-person org. Noticed full month charge on first Team invoice.

**Trigger:**
Raj upgraded from Pro ($19/mo) to Team ($49/mo) on the 15th of the month. His credit card was charged $49 immediately. He expected either pro-rated billing ($24.50 for the remaining half-month) or a credit applied to next month. He emails billing support.

**Inbound signal — Email:**
```
From: raj.patel@buildfast.io
To: support@docugardener.io
Subject: Billing question — charged full month on mid-cycle upgrade

Hi,

I upgraded our plan from Pro to Team on March 15th. I was immediately charged $49
for the full month. I expected to be charged pro-rata for the remaining 16 days
($26 approx) or receive a credit.

Can you clarify your billing policy? If it's not pro-rated, I'd like a partial refund
or credit for the 14 days I was on Pro.

Thanks
Raj Patel
BuildFast Engineering
```

**Expected NestFleet flow:**
1. Email ingress → Signal
2. Triage → Severity: **Low**, Type: Billing / Account
3. Frontline AI → searches KB for billing policy → finds "upgrade billing" policy → drafts response explaining pro-rata credit policy
4. Auto-reply gates likely fail (billing mentions "refund" → forbidden phrase gate) → case transitions to `awaiting-lead` with **draft saved to `cases.draft_reply`**
5. Operator opens case → sees **EmailReplyPanel** with AI draft → checks Raj's Stripe record → confirms over-charge (bug in upgrade flow) → **escalates to Lead** for refund approval
6. Lead approves $15 refund → issues via Stripe → Lead edits draft in **EmailReplyPanel** to include refund confirmation → clicks **"Send Reply"** → email sent to Raj
7. Case stays in `awaiting-lead` → Lead confirms refund processed → resolves case
8. CR opened: "Fix pro-rata calculation in Stripe upgrade webhook handler"

**Features exercised:** Email ingress, billing triage, forbidden phrase gate (DEFERRED-24 ✅), EmailReplyPanel edit + send, Lead escalation, Stripe refund as action item, CR for underlying bug

**Evaluation checkpoints:**
- Does AI correctly identify this as billing, not a technical bug?
- Does the forbidden phrase gate ("refund") correctly block auto-send? (This is the expected and desired behavior for billing cases)
- **[DEFERRED-24]** Does the EmailReplyPanel show the AI draft with billing explanation?
- **[DEFERRED-24]** Can the Lead edit to add refund confirmation before sending?
- **[DEFERRED-24]** Does the reply reach Raj's email thread?
- Is the "check Stripe record" step clearly prompted in the case view?

**Expected outcome:** Raj receives refund + apology within 4 hours. Bug logged as CR. Trust maintained.

---

### DG-06 · "OSS Contributor Reports Setup Crash" · GitHub · Normal Severity

**Persona:** Alex, open-source contributor evaluating DocuGardener's free tier for a large org.

**Trigger:**
The setup wizard crashes when connecting to a GitHub org with 500+ repos. Alex files a detailed GitHub issue with stack trace and repro steps.

**Inbound signal — GitHub:**
```
Title: Setup wizard crashes on large GitHub orgs (500+ repos)
Body:
I'm trying to set up DocuGardener for our org (we have ~530 repos).
The setup wizard hangs at "Scanning repositories..." for about 2 minutes
then shows a white screen. Browser console shows:
  `TypeError: Cannot read properties of undefined (reading 'map')`
  at RepositoryScanner.tsx:142

Environment: Chrome 124, macOS 14.4
DocuGardener version: v2.3.1 (self-hosted via Docker)

Steps to reproduce:
1. Install via docker-compose
2. Connect GitHub App to org with 500+ repos
3. Start setup wizard → step 3 "Select repositories"
4. Wait 2 minutes → white screen

Labels: bug
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | GitHub webhook parsed, `source_type=github_webhook` | Issue number, repo, author extracted |
| 2. Case creation | New case, product=DocuGardener | Thread linked to GitHub issue |
| 3. Triage | Severity=**normal** (free tier, no data loss, workaround possible), Type=**bug_report** | Labels: `setup-wizard`, `pagination`, `large-org`, `frontend-crash` |
| 4. Known-issue match | Pagination issues in repo scanner — may match if prior reports exist | Should NOT match unrelated issues |
| 5. Auto-reply | Confidence check: can NestFleet draft a useful ack? If gates pass → **auto-posted to GitHub issue** via `addIssueComment()`. If not → operator reviews draft. | Should acknowledge, confirm repro steps, suggest workaround (manual repo selection) if knowledge exists |
| 6. Change Request | CR: "Fix RepositoryScanner pagination for orgs with 500+ repos" | Stack trace line number included, browser info preserved |
| 7. PR Draft | Implementation hint: paginated GitHub API call, lazy loading | Quality of implementation notes — does it identify the right file? |

**Value assessment questions:**
- Did NestFleet extract the stack trace and environment info into structured metadata?
- Was severity correctly assessed (normal, not high — free tier user)?
- Did auto-reply reference the actual error or just send a generic "we received your issue"?
- Did the reply land on the GitHub issue thread (auto or operator-approved)?

---

### DG-07 · "Chat Widget Question from Trial User" · Chat Widget · Normal Severity

**Persona:** A developer evaluating DocuGardener's free tier during their first setup session.

**Trigger:**
The user asks a question through the embedded chat widget about GitHub Enterprise Server OAuth scope failure.

**Inbound signal — Chat Widget (SSE stream):**
```
User: Hi, I'm trying to connect DocuGardener to my private GitHub repos but
      the OAuth flow keeps failing with "insufficient scope". I've granted all
      requested permissions. Is there a known issue with GitHub Enterprise Server?
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Chat message → signal, `source_type=chat` | Session context preserved (trial user, first visit) |
| 2. Case creation | New case, product=DocuGardener, Type=**user_request** | |
| 3. Triage | Severity=**normal**, labels: `oauth`, `github-enterprise`, `setup` | Correct: not critical, but blocking their evaluation |
| 4. Auto-reply | **KEY TEST**: Can frontline agent answer this from knowledge base? | If DocuGardener docs contain GHE OAuth scope requirements → auto-reply with solution. If not → escalate |
| 5. Chat response | Real-time SSE push back to widget via `publish(sessionId, {...})` (CHAT-UX-01a ✅) | Latency matters — trial user won't wait 10 minutes |
| 6. Live Chats tab | Case appears in Queue → Live Chats tab with status badge (CHAT-UX-01c ✅) | Real-time refresh via SSE `chat_message` event |
| 7. Deflection metric | If auto-resolved → V4 deflection win. Widget shows "Start a new chat →" on 409 (CHAT-UX-01b ✅) | Track for suite analytics |

**Value assessment questions:**
- How fast is signal-to-response for chat widget? (target: < 60 seconds for SSE push)
- Does the auto-reply contain specific GHE OAuth scope guidance or just generic "check permissions"?
- If knowledge base doesn't have the answer, is escalation smooth?
- Does the Live Chats tab in Queue show this case in real-time (SSE badge update)?
- After resolution, does the widget correctly block further messages and show "Start a new chat →"?

---

### DG-08 · "Enterprise Prospect via Contact Form" · Contact Form · Normal Severity

**Persona:** Jennifer Walsh, VP Engineering at BigCorp Financial (2000+ developers). Evaluating documentation tools with enterprise requirements.

**Trigger:**
Jennifer fills out DocuGardener's contact form requesting information about SOC2 compliance and on-premise deployment.

**Inbound signal — Contact Form:**
```
Name: Jennifer Walsh
Email: j.walsh@bigcorp.com
Company: BigCorp Financial
Message: We're evaluating documentation tools for our engineering org (2000+
developers). Key requirements: SOC2 Type II compliance, on-premise deployment,
SAML SSO integration, and air-gapped environment support. Can you provide
documentation on your security architecture and a demo environment?
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Contact form → signal, `source_type=contact_form` | All form fields extracted, company name captured |
| 2. Case creation | product=DocuGardener, type=**user_request** | NOT a bug, NOT feedback — it's a sales inquiry |
| 3. Triage | Severity=**normal**, labels: `enterprise`, `soc2`, `on-premise`, `sso`, `air-gap` | Should NOT auto-reply with technical troubleshooting |
| 4. Routing | → **awaiting-lead** (human judgment needed — sales context) | Should route to product_lead or operator, NOT to change flow |
| 5. Notification | Email/Slack to operator with full context | Priority: normal (not urgent, but valuable lead) |
| 6. Draft reply | AI drafts acknowledgment → gates likely fail (sales context, low technical confidence) → **draft saved to `cases.draft_reply`** | Draft should be professional ack, not technical troubleshooting |
| 7. Lead action | Lead opens case → sees **EmailReplyPanel** with ack draft → edits to add sales-appropriate language → clicks **"Send Reply"** (DEFERRED-24 ✅) | "Thank you for your interest, our team will follow up within 24h" |
| 8. Case status | Case stays in `awaiting-lead` after ack send → Lead assigns to product_lead for follow-up | NOT auto-resolved — this is a qualified lead |

**Value assessment questions:**
- Does NestFleet distinguish sales inquiries from support requests?
- Is the routing correct (human lead, not agentic resolution)?
- **[DEFERRED-24]** Does the EmailReplyPanel show a draft? Can the Lead edit to match enterprise-appropriate tone before sending?
- **[DEFERRED-24]** Does the ack email reach j.walsh@bigcorp.com?
- Is company context ("2000+ developers", "BigCorp Financial") preserved in metadata?

---

### DG-09 · "Knowledge Capture After AI-Resolved Case" · Internal · Growth Feature Test

> **New scenario (2026-03-23).** Tests the `knowledge_capture` agent (Growth-tier gated). Requires DG-03 to be resolved first (fully AI-handled config question).

**Persona:** N/A — internal agent pipeline, no human sender.

**Trigger:**
DG-03 (nightly rollup config question) was auto-resolved by the AI with a high-confidence KB answer. After case resolution, NestFleet should dispatch a `knowledge_capture` job to extract a reusable FAQ pattern from this successful interaction.

**Precondition:** DG-03 must be in `resolved` status with `ai_resolved: true`.

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Case resolved | DG-03 transitions to `resolved` with `ai_resolved: true` | Verify status and flag |
| 2. Knowledge capture dispatch | `knowledge_capture` job dispatched (Growth+ tier gate passes in dev mode) | Check pg-boss queue |
| 3. Agent execution | Agent reads case conversation + AI reply + KB evidence refs | Tool calls: `lookupFaq`, `searchSimilarCases`, `lookupKnownIssue` |
| 4. FAQ extraction | Agent produces structured FAQ: Q + A + source refs + confidence | Output stored as knowledge asset |
| 5. Knowledge tab | New asset appears in Console → Knowledge tab (pending review) | Badge update in sidebar |
| 6. Operator review | Knowledge lead reviews, approves/rejects the extracted FAQ | Approval workflow |

**Features exercised:** Knowledge capture agent (Growth-tier gated), post-resolution automation, knowledge asset creation, operator review workflow

**Evaluation checkpoints:**
- Does the `knowledge_capture` job fire automatically after AI-resolved case?
- Is the extracted FAQ accurate and non-redundant with existing KB?
- Does the Knowledge tab show the new asset with pending-review status?
- Would this FAQ help answer similar future questions without KB seeding?
- **Tier gate test:** If license were Community, does the dispatch correctly reject with `GROWTH_GATED_ACTIONS`?

**Expected outcome:** A new FAQ knowledge asset derived from the successful DG-03 resolution, ready for operator review. Demonstrates the learning loop: signal → case → AI resolution → extracted knowledge → future deflection.

---

## SkillSeal Scenarios

---

### SS-01 · "Credential Not Appearing in Vault After Claim" · Email · High Severity

**Persona:** Amara, freelance UX designer. Completed a "Figma Advanced" badge on a partner EdTech platform (SkillSeal Starter issuer). Received claim email, clicked link, confirmed identity. Vault shows empty.

**Trigger:**
Amara's portfolio review is tomorrow. She was planning to share her newly claimed credential with a recruiter. She replies to the claim confirmation email asking what happened.

**Inbound signal — Email:**
```
From: amara.diallo@gmail.com
To: support@skillseal.io  (reply to: "Your SkillSeal credential is ready to claim")
Subject: Re: Your SkillSeal credential is ready to claim

Hi, I clicked the claim link, confirmed my email, and it said my account was set up.
But when I log in to the Vault, there are no credentials showing.
I have a portfolio review tomorrow and really need this.

Amara
```

**Expected NestFleet flow:**
1. Email ingress → Signal → identity resolved via email → linked to Amara's identity record
2. Triage → Severity: **High** (time pressure: "tomorrow", user-facing data loss), Type: Bug / Credential Delivery
3. Frontline AI → KB search: "credential not appearing", "vault empty after claim" → likely match: "Smart Account deployed but credential mint transaction queued in BullMQ — check Redis queue health"
4. Auto-reply gates likely fail (confidence may be <0.85 for infrastructure-dependent issue) → case transitions to `awaiting-lead` with **draft saved to `cases.draft_reply`**
5. Lead opens case → sees **EmailReplyPanel** with AI draft pre-filled → edits to add BullMQ context from KB → clicks **"Send Reply"** → email sent to Amara
6. Case **stays in `awaiting-lead`** after send (monitoring state) — Lead does NOT resolve yet
7. Lead monitors → if credential doesn't appear in 20 min → checks BullMQ queue externally (stuck job) → manual retry
8. Credential appears → Lead resolves case

**Features exercised:** Email ingress, identity deduplication, triage, draft persistence (DEFERRED-24 ✅), EmailReplyPanel edit + send, `awaiting-lead` as monitoring state, email reply threading

**Evaluation checkpoints:**
- Does NestFleet correlate Amara's email to an existing identity if she's contacted before?
- Does the AI response avoid asking for information that's already in the email body?
- Does the KB article content about BullMQ troubleshooting surface in the AI reply or case context, giving the operator enough info to investigate SkillSeal's infrastructure separately? (PO Review §G2: NestFleet has no direct access to SkillSeal's BullMQ — it can only surface KB knowledge)
- **[DEFERRED-24]** Does the EmailReplyPanel appear in the case detail when status is `awaiting-lead`?
- **[DEFERRED-24]** Is the AI draft pre-filled and editable in the textarea?
- **[DEFERRED-24]** After clicking "Send Reply", does the email reach Amara? Does the case remain in `awaiting-lead`?
- **[DEFERRED-24]** Is the draft cleared from DB after send (no stale draft on refresh)?

**Expected outcome:** Credential delivered before portfolio review. Lead sends edited reply with BullMQ context, monitors, resolves after confirmation. Full email round-trip verified.

---

### SS-02 · "Issuer Webhook Failures After Version Deploy" · GitHub · Critical Severity

**Persona:** Viktor, CTO at TalentHub (a job board, SkillSeal Growth plan at $499/mo). 200+ credential deliveries silently failed over the last 6 hours.

**Trigger:**
SkillSeal deployed v2.1.0 this morning. TalentHub's webhook endpoint started returning 200 but receiving malformed payloads (missing `credentialId` field in the body). Their backend silently drops malformed webhooks. Viktor only noticed because their dashboard shows 0 new credentials issued today despite active applications. He opens a GitHub issue with logs.

**Inbound signal — GitHub:**
```
Title: [v2.1.0] Webhook payload missing credentialId field — 200+ failed deliveries
Body:
Since v2.1.0 deployed at ~09:00 UTC, our webhook endpoint is receiving malformed payloads.

Expected payload structure:
{ "event": "credential.issued", "credentialId": "cred_xxx", "talentDid": "did:xxx", ... }

Actual payload received:
{ "event": "credential.issued", "talentDid": "did:xxx", ... }  ← credentialId missing

We process ~35 credentials/hour. All today's issuances are undelivered.
This is a regression from v2.0.x where credentialId was always present.

Attached: webhook logs (last 50 events), v2.0.x vs v2.1.0 payload diff
Labels: bug, regression, critical, billing-impact
```

**Expected NestFleet flow:**
1. GitHub webhook → Signal → triage
2. Severity: **Critical** (regression, revenue-impacting for paying customer, volume: 200+ affected)
3. Frontline AI: recognizes regression pattern → no KB fix available → immediately escalates: "Engineering regression, payload schema break in v2.1.0"
4. **Lead notified immediately** (Slack + email)
5. Lead opens case → reviews Viktor's logs → confirms regression
6. Lead creates **Change Request**: "Hotfix: restore credentialId in webhook payload — v2.1.1"
7. CR triggers GitHub PR in SkillSeal repo → merged → v2.1.1 deployed
8. Post-fix: create a second CR / action item for "replay 200+ failed webhooks" (NestFleet tracks this; SkillSeal's backend executes it — see PO Review §G3)
9. Viktor notified at each CR status change

**Features exercised:** GitHub ingress with attachments context, Critical escalation, Lead notification, CR → GitHub PR → auto-complete on merge, webhook replay action item, customer status updates

**Evaluation checkpoints:**
- Does "regression" + "billing-impact" label reliably produce Critical severity?
- Are CR status changes communicated back to Viktor via GitHub issue comment?
- Is "replay failed webhooks" capturable as a CR sub-task or action item?
- Does the case remain open until operator manually confirms replay completion? (PO Review §G3: NestFleet cannot verify SkillSeal webhook replay — operator closes case after Viktor confirms)

**Expected outcome:** Hotfix deployed within 2 hours. Replay tracked as a separate CR. Case remains open until operator manually confirms replay is complete. Viktor receives proactive update at each CR stage change.

---

### SS-03 · "ZK Proof Generation Timeout on Batch Verification" · Email (re-channeled from Slack) · High Severity

> **PO Review §B1:** Originally Slack-sourced. Re-channeled to email because Slack inbound is not implemented. When Slack inbound ships, re-run via Slack.

**Persona:** Claire, Senior Technical Recruiter at a Fortune 500 (Recruiter Pro plan, $199/mo). Running a hiring sprint for 45 blockchain developer roles.

**Trigger:**
Claire submits a batch verification job for 50 candidates using ZK selective disclosure ("prove >$120K earnings"). The job starts, processes 3 candidates, then times out with no error shown in the UI. She retries twice — same result. She emails SkillSeal support.

**Inbound signal — Email:**
```
From: claire@techcorp.com
To: support@skillseal.io
Subject: Batch ZK verification timing out after 3 candidates

Hi,

Batch ZK verification is timing out after 3 candidates. I have a 50-person batch
and a hiring review meeting in 4 hours.

The UI just shows a spinner and then nothing. No error. I've tried 3 times.

Plan: Recruiter Pro ($199/mo). Using selective disclosure (>$120K threshold).

Claire Dubois
Senior Technical Recruiter, TechCorp
```

**Expected NestFleet flow:**
1. Email ingress → Signal created (`source_type: email`)
2. Triage → Severity: **High** (4-hour deadline, paying Recruiter Pro customer, blocking business workflow), Type: Performance / Infrastructure
3. Frontline AI → KB: "ZK proof timeout" → likely match: Groth16 proof generation is CPU-bound; batch sizes > 10 with ZK disclosure can exceed the 30s worker timeout at current infra allocation
4. AI drafts response: workaround — run batches of 10 with ZK, or use standard verification for large batches (no ZK, just cryptographic check)
5. **Path A — Auto-send:** All gates pass (confidence ≥ 0.85, T1 source) → reply sent automatically to Claire → case auto-resolved
6. **Path B — Draft held:** Any gate fails → case transitions to `awaiting-lead` with **draft saved to `cases.draft_reply`** → Lead opens case → sees **EmailReplyPanel** with workaround draft → reviews/edits → clicks **"Send Reply"** → email sent to Claire
7. Simultaneously (either path): **Escalates to Lead** with infra ticket: "ZK batch worker timeout — increase worker timeout or add horizontal scaling for ZK jobs"
8. Lead creates CR for infrastructure fix

**Features exercised:** Email ingress, triage, AI workaround from KB, auto-reply or draft persistence + EmailReplyPanel (DEFERRED-24 ✅), parallel escalation + CR

**Evaluation checkpoints:**
- Does the KB article on ZK batch limits surface in the AI response? (PO Review §G2: the answer is only as good as the KB — verify `mc_beta_ss_zk_batch_limits` chunk is retrieved)
- Does "4 hours" trigger correct urgency?
- Does the workaround draft include concrete batch size numbers (10) from the KB?
- **If Path B [DEFERRED-24]:** Does the EmailReplyPanel show the draft with ZK batch workaround? Does email reach Claire after Lead sends?

**Expected outcome:** Claire gets workaround in <10 min and completes her hiring review. Infrastructure fix tracked as CR.

---

### SS-04 · "Institutional Issuer DID Not Resolving After Domain Migration" · Email · Medium Severity

**Persona:** James, IT Administrator at Northampton University (Growth plan issuer, $499/mo). The university's IT team migrated from `northampton.ac.uk` to `northamptonuniversity.edu` last week.

**Trigger:**
Students who received credentials from Northampton University are sharing their verifiable credential links. Verifiers click the link and see "⚠️ Issuer verification failed — DID document not resolvable." The university's DID was anchored to the old domain's DNS TXT record. James emails support after the university's registrar office receives complaints from 12 students.

**Inbound signal — Email:**
```
From: j.hartley@northamptonuniversity.edu
To: support@skillseal.io
Subject: University credentials showing "issuer verification failed" after domain change

Hello,

Our university migrated to a new domain last week. We were previously
northampton.ac.uk and are now northamptonuniversity.edu.

Students are reporting that their credentials show an error when shared:
"Issuer verification failed — DID document not resolvable"

I believe this is related to a DNS TXT record we set up during onboarding for the
old domain. Can you advise how to update the DID configuration?

James Hartley
IT Systems Administrator, Northampton University
```

**Expected NestFleet flow:**
1. Email ingress → Signal → Identity: Northampton University (institutional identity, Growth plan)
2. Triage → Severity: **Medium** (affects active credentials for 12+ students, institution reputation), Type: Integration / Configuration
3. Frontline AI → KB: "update DID domain", "DNS TXT record", "KYB re-verification" → high-confidence answer:
   - Add DNS TXT record `skillseal-verification=<token>` to new domain
   - Re-trigger KYB verification from Issuer Command Center → Settings → Domain Verification
   - DID document will be updated automatically once DNS propagates (24-48h)
   - Existing credentials remain valid — they reference the DID, which will resolve once domain re-verified
4. Auto-reply gates: likely pass (high confidence, T1 KB match, no forbidden phrases) → **Path A: auto-send** OR gates fail → **Path B: draft held in `cases.draft_reply`**
5. **Path A:** Reply sent automatically to James with step-by-step DNS instructions
6. **Path B:** Lead opens case → sees **EmailReplyPanel** with AI draft → reviews DNS instructions → clicks **"Send Reply"** → email sent to James
7. Follow-up in 48h: confirm DNS propagated and credentials resolving

**Features exercised:** Email ingress, institutional identity, AI KB resolution, auto-reply or draft persistence + EmailReplyPanel (DEFERRED-24 ✅), follow-up scheduling

**Evaluation checkpoints:**
- Does AI response include the actual DNS TXT record format, not just general instructions?
- Does auto-send fire (Path A) or does it fall to draft-held (Path B)?
- **If Path B [DEFERRED-24]:** Does the EmailReplyPanel show the DNS migration instructions? Does email reach James?
- Is the 48h follow-up trackable within NestFleet (SLA / reminder)?
- Does NestFleet surface "Growth plan customer" context to the operator (higher priority, higher retention risk)?

**Expected outcome:** James resolves the DNS issue within 1 day. Credentials valid again. Zero escalation needed.

---

### SS-05 · "Meta-Skill Composite Includes Outdated Credential" · Email · Medium Severity (calibration note)

**Persona:** Marco, Senior Solidity Developer (Talent Pro, $9/mo). SkillSeal auto-synthesized a "Web3 Full-Stack Developer" Meta-Skill credential by combining 4 of his verified badges. The composite includes a Solidity v0.7 badge from 2021 — current standard is 0.8.x — making him appear to have outdated skills.

**Trigger:**
Marco is in a live recruitment process. The recruiter ran a ZK verification and the composite shows Solidity v0.7. The recruiter questions this. Marco is upset — the AI synthesis combined credentials it shouldn't have, and this is actively harming his job prospects.

**Inbound signal — Email:**
```
From: marco.rossi@protonmail.com
To: support@skillseal.io
Subject: Auto-generated credential contains outdated skills — damaging my job application

Your AI auto-generated a "Web3 Full-Stack Developer" credential for me that includes
a Solidity v0.7 badge from 2021. I'm currently in a hiring process and the recruiter
has flagged this as outdated (current standard is v0.8+).

I have a v0.8 certification from 2023 that should have been used instead, or
the 2021 badge should have been excluded given I have a more recent one.

This is causing real damage to my job application. I need this fixed urgently.

Marco Rossi
```

**Expected NestFleet flow:**
1. Email ingress → Signal → Identity: Marco (existing Talent Pro user)
2. Triage → Severity: **Medium** (single user, no data loss, no service outage, no security breach). Note per PO Review §G1: the triage prompt has no concept of "reputation/legal risk" as a severity escalator. "Damaging my job application" may push it to High but Medium is the correct calibration per current rules. If it returns High, that's a positive signal that the LLM is reading between the lines.
3. Frontline AI → KB: "Meta-Skill synthesis criteria", "update composite credential" → partial match: synthesis always picks the credential with highest confidence score, not newest date — this is a known limitation, not a bug
4. AI drafts: empathetic acknowledgment + explanation + "we are reviewing your specific composite" — does NOT auto-resolve (confidence likely <0.85 due to sensitivity)
5. Auto-reply gates fail (low confidence + sensitivity) → case transitions to `awaiting-lead` with **draft saved to `cases.draft_reply`**
6. **Operator opens case → sees EmailReplyPanel with AI draft** → recognizes reputation risk → **escalates to Lead**
7. Lead reviews Marco's credential set → manually triggers re-synthesis excluding deprecated credentials → new composite issued
8. Lead edits draft in **EmailReplyPanel** → writes apology + explanation + confirmation new credential is live → clicks **"Send Reply"** → email sent to Marco
9. Case stays in `awaiting-lead` → Lead confirms new composite is correct → resolves case
10. Internally: CR opened — "Meta-Skill synthesis should prefer newest credential when multiple exist for same skill domain; add deprecation window config"

**Features exercised:** Email ingress, triage calibration test, sensitive case handling, draft persistence (DEFERRED-24 ✅), EmailReplyPanel edit + send, Lead escalation, CR for product fix

**Evaluation checkpoints:**
- Does the AI correctly withhold an auto-response on sensitive cases? (low confidence → `awaiting-lead` is the correct behavior)
- **[DEFERRED-24]** Does the EmailReplyPanel show the empathetic AI draft? Can the Lead substantially rewrite it before sending?
- **[DEFERRED-24]** Does the reply reach Marco? Does the case stay in `awaiting-lead` for monitoring?
- Does the KB article about Meta-Skill synthesis criteria surface in the case context, giving the operator actionable information? (PO Review §G2: this depends entirely on the KB, not on NestFleet "magic")
- Does the Lead have enough context in the case to understand what re-synthesis means without reading the full SkillSeal spec?

> **Triage calibration note (PO Review §G1):** If this scenario consistently triages as Normal/Low, that's a valid finding for triage prompt tuning — consider adding "career/financial harm" as a severity signal. This is a prompt engineering improvement, not a NestFleet bug.

**Expected outcome:** New credential issued within 2 hours. Marco's job application recovers. Product team notified of synthesis logic gap.

---

### SS-06 · "Batch Verification API Returns 500" · Email · Critical Severity

**Persona:** Operations team at TalentBridge, a staffing agency. Using SkillSeal's verification API in production. Blocking a $2M placement deal.

**Trigger:**
Batch credential checks (>50 candidates) consistently fail with 500 errors. They discovered this during a hiring sprint with a March 25th deadline.

**Inbound signal — Email:**
```
From: ops@talentbridge.co
Subject: CRITICAL: Batch verification API broken — blocking $2M placement deal

Our integration with your /api/v1/credentials/verify-batch endpoint is
returning 500 errors for any batch over 50 candidates. We have a placement
deadline of March 25th for our biggest client (180 candidates to verify).

Error response:
{
  "error": "Internal Server Error",
  "requestId": "req_8f2k4m9x",
  "timestamp": "2026-03-19T14:22:00Z"
}

This worked fine last week with batches of 200+. Something changed in your
latest release.

Urgency: This is blocking a $2M placement deal.
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Email parsed, sender=ops@talentbridge.co | Subject line "CRITICAL" captured |
| 2. Triage | Severity=**critical** (API broken, revenue-blocking, deadline), Type=**bug_report** | Must detect: $2M deal, March 25 deadline, regression ("worked last week") |
| 3. Outage routing | **TRIGGERED** — severity=critical → outage routing agent activated | Affected component: batch-verification-api, runbook lookup |
| 4. Notification | **Immediate** — bypass quiet hours, Slack + Email to all leads | Priority=critical, no digest delay |
| 5. Known-issue match | Search for batch-size related issues, recent deployments | Regression flag: "worked last week" + "latest release" |
| 6. Change Request | CR: "Fix batch verification API regression for >50 candidates" | Impact: revenue-blocking, deadline March 25 |
| 7. Approval | **Fast-track** — critical severity should expedite approval flow | Risk=high but business impact justifies |
| 8. Auto-reply | Immediate ack via **EmailReplyPanel**: "We've escalated this as critical, investigating now" | Must NOT say "we'll look into it next week" |
| 9. Lead action | Lead opens case → sees **EmailReplyPanel** with ack draft → edits if needed → clicks **"Send Reply"** (DEFERRED-24 ✅) | Case stays in `awaiting-lead` after send |

**Value assessment questions:**
- Does NestFleet correctly classify this as critical (not just high)?
- Is the outage routing agent triggered? Does it identify the right component?
- Is notification truly immediate (no quiet-hours blocking)?
- **[DEFERRED-24]** Does the EmailReplyPanel show an urgency-appropriate ack draft? Does the reply reach ops@talentbridge.co?
- Is the $2M context and March 25 deadline captured in CR metadata?

**Note:** Compare with SS-02 (also critical, also regression) — SS-02 comes via GitHub with logs attached; SS-06 comes via email with error JSON inline. Does channel affect triage quality?

---

### SS-07 · "ZK Proof Fails on Mobile Wallet" · Chat Widget · High Severity

**Persona:** An end-user preparing for a job interview tomorrow who needs to share a verified credential with a recruiter.

**Trigger:**
User reports via chat widget that the "Generate Proof" button on mobile does nothing on both iPhone and Android.

**Inbound signal — Chat Widget:**
```
User: I'm trying to share my verified React experience with a recruiter using
      the mobile wallet. When I tap "Generate Proof" nothing happens. I've tried
      on iPhone 15 (Safari) and Pixel 8 (Chrome). The recruiter needs this by
      tomorrow for my interview. Can you help?
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Chat → signal, `source_type=chat` | Mobile context: iPhone Safari + Pixel Chrome |
| 2. Triage | Severity=**high** (user blocked, time-sensitive interview), Type=**bug_report** | Labels: `zk-proof`, `mobile`, `wallet`, `cross-browser` |
| 3. Auto-reply | Can frontline answer? Likely NO (ZK proof generation is core infra) | Should acknowledge + escalate, not attempt generic answer |
| 4. Chat response | Acknowledgment pushed to widget via SSE in real-time (CHAT-UX-01a ✅) | User sees "we're investigating" within seconds |
| 5. Live Chats tab | Case appears in Queue → Live Chats tab with "high" severity badge (CHAT-UX-01c ✅) | Operator sees it immediately via SSE event |
| 6. Routing | → **awaiting-lead** (needs engineering investigation) | Not change flow yet — need diagnosis first |
| 7. Known-issue match | Search for mobile ZK proof issues, WASM compatibility | WASM/SnarkJS mobile Safari issues are plausible |
| 8. Notification | Slack + email → support_lead with chat context | Include device info and deadline ("interview tomorrow") |
| 9. Operator reply | Lead replies via case chat panel → SSE push to widget | User sees response in real-time without page refresh |

**Value assessment questions:**
- Does NestFleet recognize "interview tomorrow" as a time constraint?
- Does auto-reply correctly NOT try to solve a ZK proof infrastructure issue?
- Is the escalation path fast enough for a chat-originated case?
- Does the Live Chats tab surface this case in real-time?
- When operator/lead replies, does the SSE push reach the widget instantly?
- After resolution, does the widget block further messages (409 → "Start a new chat →")?
- Compare with SS-03 (also ZK, but server-side batch timeout via email) — different root cause, same channel (both re-channeled to email). Does NestFleet differentiate the triage?

---

### SS-08 · "Blockchain Anchor Failure from L2 Congestion" · Scheduled · Critical Severity

**Persona:** N/A — infrastructure monitoring alert (no human sender).

**Trigger:**
SkillSeal's monitoring detects that Base L2 network is congested, causing credential anchoring transactions to fail. Multiple issuers affected.

**Inbound signal — Scheduled/Monitoring:**
```
Alert: Blockchain anchor failure rate > 50%
Component: credential-anchor-service
Error: Transaction underpriced (gas estimation failed)
Affected: 23 pending credential issuances in last hour
Network: Base L2 (chainId: 8453)
First occurrence: 2026-03-20T15:00:00Z
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Scheduled/monitoring → signal | Structured alert metadata preserved |
| 2. Triage | Severity=**critical** (23 users blocked, infrastructure failure), Type=**outage_report** | |
| 3. Outage routing | **TRIGGERED** — runbook for blockchain anchor failures | Gas estimation retry strategy, fallback network |
| 4. Notification | **Immediate** to all leads, bypass quiet hours | Must include: 23 pending issuances, gas failure |
| 5. Auto-reply | N/A (internal monitoring, no external user to reply to) | But affected issuers should get status notification |
| 6. Change Request | CR: "Implement dynamic gas estimation with fallback for Base L2 congestion" | Long-term fix, not just retry |

**Value assessment questions:**
- Does NestFleet correctly escalate infrastructure alerts to critical?
- Is the outage routing agent useful for blockchain-specific incidents?
- Does it distinguish between "retry will fix it" and "needs code change"?
- Is this scenario a pure overhead (NestFleet adds nothing over PagerDuty) or does the CR creation and audit trail add value?

---

### SS-09 · "OU Limit Reached During Peak Hiring Sprint" · Email · Normal Severity (system test)

> **New scenario (2026-03-23).** Tests Outcome Unit (OU) enforcement at the ingress boundary (BIL-04). Validates graceful degradation when monthly OU limit is exhausted.

**Persona:** Recurring support email from an existing SkillSeal customer during a peak period where OU budget is exhausted.

**Trigger:**
SkillSeal's NestFleet instance has consumed 100% of its monthly OU allocation (simulated). A new email signal arrives from a customer. NestFleet should accept the signal but block agent dispatch, notifying the operator of the capacity limit.

**Setup:** Before injecting, set OU usage to 100% via DB update on the `product_llm_usage` table or license mock.

**Inbound signal — Email:**
```
From: hiring-ops@staffingco.com
To: support@skillseal.io
Subject: Candidate verification API returning stale data

Hi, we're seeing stale verification results for candidates who updated
their credentials yesterday. The API returns the old credential status.
Is there a cache TTL we can configure?

StaffingCo Ops Team
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Email → signal created (ingress always accepts) | Signal recorded regardless of OU status |
| 2. OU check | `getOuStatus()` returns `"blocked"` (100% consumed) | Ingress returns `ouStatus: "blocked"` |
| 3. Case creation | Case created but **no triage job dispatched** | Case sits in `new` status — no agent runs |
| 4. Operator notification | Notification: "OU limit reached — new cases are not being triaged" | Must be visible in Console + Slack/email |
| 5. Dashboard | Settings → Plan shows OU bar at 100% (red) | Operator sees the constraint clearly |
| 6. Resolution | Operator upgrades plan or waits for monthly reset → cases auto-queued | Backlog clears when capacity restored |

**Features exercised:** OU tracking (BIL-04), ingress soft-block, operator notification, dashboard OU bar, graceful degradation

**Evaluation checkpoints:**
- Does NestFleet accept the signal but correctly block agent dispatch?
- Is the operator notified clearly about the capacity limit (not a silent failure)?
- Does the case appear in Console (visible but untriaged)?
- Does the OU bar in Settings → Plan accurately reflect 100% consumption?
- When OU resets (or plan upgrades), do queued cases get processed?

**Expected outcome:** Signal preserved, operator informed, no data loss. Demonstrates that NestFleet degrades gracefully under capacity constraints rather than failing silently or dropping signals.

---

## Cross-Product Scenarios

---

### XP-01 · "DocuGardener Detects Stale API Docs via Bridge" · Bridge Event · Low→Medium Severity

**Context:** DocuGardener's own nightly scan detects that NestFleet's API docs
for the `/api/v1/signals` endpoint are 3 versions behind. This triggers the
integration bridge. The same endpoint is also referenced in SkillSeal's
NestFleet integration guide.

**Channel:** Internal bridge event (`bridge.doc-gap.detected`)

**Signal content:**
```json
{
  "event": "bridge.doc-gap.detected",
  "sourceProduct": "docugardener",
  "targetProduct": "nestfleet",
  "payload": {
    "docPath": "docs/api/signals.md",
    "currentVersion": "v1.2",
    "latestCodeVersion": "v1.5",
    "driftScore": 0.73,
    "affectedEndpoints": [
      "POST /api/v1/signals",
      "GET /api/v1/signals/:id"
    ],
    "suggestedAction": "update_docs"
  }
}
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Bridge event received | Internal signal, `source_type=scheduled` | No external notification yet |
| 2. Case creation | product=NestFleet (self-referential), type=**user_feedback** | Labeled `doc-drift`, `api-docs`, `bridge-event` |
| 3. Triage | Severity=**low** (internal quality, no customer impact) | Should NOT be escalated |
| 4. Routing | → Knowledge lead or auto-resolve with doc update CR | If DocuGardener's autoHeal is available, route there |
| 5. Knowledge badge | Console shows "pending review" badge in Knowledge tab | V5 cross-product value |
| 6. Cross-product check | Does NestFleet also detect SkillSeal's integration guide references the same endpoint? | Multi-product case creation? |

**Value assessment questions:**
- Does the bridge event flow actually work end-to-end?
- Is the case created with enough context for someone to act?
- Does NestFleet add value here or is it just forwarding a notification?
- Does NestFleet create cases for BOTH products when the stale endpoint is referenced in multiple integration guides?
- Does the lineage graph show the cross-product connection?

---

### XP-02 · "Same Customer Opens Tickets in Both Products" · Email · Mixed Severity

> **Dependency:** This scenario **requires DG-02 to be run first** so that `sarah.chen@medcore.io` has an existing identity record in the DocuGardener product. The test validates whether the same email address creates a cross-product identity link when used against SkillSeal.

**Context:** Sarah Chen (`sarah.chen@medcore.io`, from DG-02's compliance export scenario) has an active case in DocuGardener. She now emails SkillSeal support about an unrelated issue. Does the system surface the unified customer view?

**Channel:** Email (same sender email, different product)

**Signal content:**
```
From: sarah.chen@medcore.io
To: support@skillseal.io
Subject: Need to bulk-import credentials for new hires

Hi, we're onboarding 45 new engineers next month and need to bulk-import
their verified credentials from our internal training platform. Is there
a batch import API or CSV upload option?

Thanks,
Sarah Chen
MedCore Devices
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Email → signal, product=SkillSeal | Identity linked to sarah.chen@medcore.io |
| 2. Identity resolution | **KEY TEST**: Does NestFleet show "this sender has active cases in DocuGardener"? NestFleet resolves identity per-product, so a new identity is created for SkillSeal. The cross-product link depends on whether identity matching is email-global or product-scoped. | Cross-product identity linking |
| 3. Triage | Severity=**normal**, Type=**user_request** | Independent of her DocuGardener case |
| 4. Context enrichment | Does the case view show her history across products? | Unified customer timeline |

**Value assessment questions:**
- Is identity resolution product-scoped (separate identities per product) or email-global (one identity across all products)?
- If product-scoped: is there any cross-product context surfaced in the case view?
- Does the operator see cross-product context without switching views?
- Is identity linking automatic or does it require manual correlation?

---

### XP-03 · "Operator Uploads Product Memory → Next Case Retrieves It" · Internal · WAVE 5 Test

> **New scenario (2026-03-23).** Tests the WAVE 5 product memory ingestion pipeline end-to-end: operator uploads a doc via Console → chunking → embedding → retrieval by the next triage agent.

**Persona:** Operator (Alexey) uploads a new troubleshooting doc for SkillSeal, then a customer email arrives that should match the newly ingested content.

**Trigger (2-step):**

**Step A — Upload:**
Operator navigates to Console → Knowledge → Sources tab → Upload slide-over. Uploads a new troubleshooting doc:
```
Title: "Credential revocation propagation delay"
Content: When an issuer revokes a credential, the revocation status propagates
to verifiers within 15 minutes via the revocation registry polling interval.
If a verifier sees stale "valid" status after 15 minutes, check:
1. Revocation registry endpoint is reachable from verifier's network
2. Verifier's polling interval hasn't been overridden (default: 900s)
3. CDN cache isn't serving stale registry snapshots (purge via /admin/cache/purge)
Source type: troubleshooting_guide (Tier 3)
```

**Step B — Signal injection:**
```
From: compliance@finserv.co
To: support@skillseal.io
Subject: Revoked credential still showing as valid after 30 minutes

We revoked a credential for a terminated employee 30 minutes ago but
verifiers still see it as valid. This is a compliance issue — we need
the revocation to propagate immediately.

FinServ Compliance Team
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Memory ingest | Doc uploaded via Console → `POST /memory/ingest` → chunked → embedded → stored in `memory_chunks` | Health panel updates, source appears in Sources tab |
| 2. Signal ingestion | Email → signal → case created for SkillSeal | Normal ingress flow |
| 3. Triage + retrieval | Frontline agent queries memory → **retrieves the newly uploaded doc** via vector similarity | Evidence refs should include the revocation propagation article |
| 4. AI response | Drafts response referencing the 15-minute polling interval, CDN cache purge, and registry endpoint check | Specific, actionable — not generic |
| 5. Operator review | Reviews draft, sees KB evidence attribution pointing to the just-uploaded doc | Lineage: upload → chunk → retrieval → draft |

**Features exercised:** WAVE 5 memory ingestion UI, chunking pipeline, embedding, vector retrieval, triage KB lookup, evidence attribution

**Evaluation checkpoints:**
- Does the upload → chunk → embed pipeline complete without errors?
- Does the Health panel reflect improved coverage after upload?
- Does the triage agent retrieve the newly uploaded doc (not just pre-seeded beta KB)?
- Is the evidence attribution in the case view traceable back to the uploaded source?
- **Latency test:** How quickly after upload is the content retrievable? (target: immediate — no batch delay)

**Expected outcome:** Proves the operator → KB → agent feedback loop works end-to-end. A doc uploaded 5 minutes ago is already improving AI triage quality. This is the core knowledge flywheel.

---

## Evaluation Matrix

| ID | Product | Channel | Severity | Type | Primary Feature | AI-Resolvable? |
|----|---------|---------|----------|------|----------------|----------------|
| DG-01 | DocuGardener | GitHub | High | Bug / False Positive | KB + CR | Partial (workaround yes, root cause no) |
| DG-02 | DocuGardener | Email | High (calibration note) | Bug / Data Export | Escalation to Lead | No — needs operator |
| DG-03 | DocuGardener | Email (re-channeled) | Low | Config Question | AI KB response | **Yes — fully** |
| DG-04 | DocuGardener | GitHub | Medium | Bug / RAG | Partial AI + CR | Partial |
| DG-05 | DocuGardener | Email | Low | Billing | Billing triage + Lead approval | Partial |
| DG-06 | DocuGardener | GitHub | Normal | Bug / Pagination | AI ack + CR | Partial |
| DG-07 | DocuGardener | Chat Widget | Normal | Setup Question | AI KB deflection | **Yes — fully** |
| DG-08 | DocuGardener | Contact Form | Normal | Sales Inquiry | Human routing | No — needs human |
| SS-01 | SkillSeal | Email | High | Bug / Queue | AI triage + operator retry | Partial |
| SS-02 | SkillSeal | GitHub | Critical | Regression | CR + hotfix + replay | No |
| SS-03 | SkillSeal | Email (re-channeled) | High | Performance | AI workaround + infra CR | Partial |
| SS-04 | SkillSeal | Email | Medium | Config / DNS | AI KB (full answer) | **Yes — fully** |
| SS-05 | SkillSeal | Email | Medium (calibration note) | AI Quality | Lead judgment + manual action | No — human judgment |
| SS-06 | SkillSeal | Email | Critical | API Regression | Outage routing + CR | No |
| SS-07 | SkillSeal | Chat Widget | High | Mobile Bug | Escalation | No |
| SS-08 | SkillSeal | Scheduled | Critical | Infrastructure | Outage routing + CR | No |
| DG-09 | DocuGardener | Internal | N/A | Knowledge Capture | Post-resolution learning (Growth) | N/A — agent pipeline test |
| SS-09 | SkillSeal | Email | Normal | OU Limit | Graceful degradation (BIL-04) | No — system constraint test |
| XP-01 | Cross-product | Bridge | Low | Doc Drift | Bridge + knowledge | Partial |
| XP-02 | Cross-product | Email | Normal | Identity | Cross-product linking | N/A — identity test |
| XP-03 | Cross-product | Internal + Email | Normal | Memory Ingest | Upload → retrieval loop (WAVE 5) | Partial — tests KB flywheel |

### Channel coverage

| Channel | Scenarios | Count | Notes |
|---------|-----------|-------|-------|
| Email | DG-02, DG-03*, DG-05, SS-01, SS-03*, SS-04, SS-05, SS-06, SS-09, XP-02, XP-03 (step B) | 11 | *DG-03, SS-03 re-channeled from Slack (PO §B1) |
| GitHub Webhook | DG-01, DG-04, DG-06, SS-02 | 4 | Auto-reply now posts to GitHub issues (PO §B2 ✅ resolved) |
| Chat Widget | DG-07, SS-07 | 2 | SSE push + Live Chats tab (CHAT-UX-01 ✅) |
| Contact Form | DG-08 | 1 | |
| Bridge Event | XP-01 | 1 | |
| Scheduled/Monitoring | SS-08 | 1 | |
| Internal (agent pipeline) | DG-09, XP-03 (step A) | 2 | Knowledge capture + memory ingest |
| ~~Slack~~ | ~~DG-03, SS-03~~ | ~~0~~ | Deferred — inbound not implemented |

### Severity distribution (calibration-adjusted)

| Severity | Scenarios | Count | Notes |
|----------|-----------|-------|-------|
| Critical | SS-02, SS-06, SS-08 | 3 | DG-02 moved to High (PO §G1) |
| High | DG-01, DG-02*, SS-01, SS-03, SS-07 | 5 | *DG-02 may still hit Critical |
| Medium | DG-04, SS-04, SS-05* | 3 | *SS-05 may hit High (calibration test) |
| Normal | DG-06, DG-07, DG-08, SS-09, XP-02, XP-03 | 6 | SS-09/XP-03 are system tests |
| Low | DG-03, DG-05, XP-01 | 3 | |
| N/A | DG-09 | 1 | Internal agent pipeline — no severity assignment |

---

## Execution Results (Phase 1–2 — 2026-03-23/24)

**Infrastructure:** Backend :3001 · Console :3002 · PlatformCloud :4000 · PostgreSQL :5434 · Resend (free tier)
**LLM:** Google Gemini 2.5 Flash (upgraded from 2.0 Flash mid-eval) · Embeddings: gemini-embedding-001 (768 dims)
**License:** Development (all features unlocked)

### Completed scenarios (12 / 21)

| ID | Status | Severity (expected→actual) | Auto-resolved? | Key findings | Bugs found |
|----|--------|---------------------------|----------------|--------------|------------|
| DG-01 | ✅ Triaged | High→**Critical** | No (awaiting-lead) | KB evidence [1],[2] surfaced, labels accurate (`false_positive, release_block`), routing to Tools ✅ | Severity over-triage (defensible — 2h release deadline) |
| DG-02 | ✅ Full flow | High→**Critical** | No (Lead escalation) | GitHub issue auto-created ✅, CR→approval→real GitHub PR ✅, email composer tested, artifact links fixed during test | Resend FROM field (fixed), CR missing GitHub issue link (fixed) |
| DG-03 | ✅ Auto-resolved | Low→**Normal** | **Yes** | Auto-reply gates passed (confidence=1.0, Tier 1), resolved without operator ✅ | Outbound reply not stored (fixed), severity over-triage (fixed: model upgrade + token budget) |
| DG-04 | ✅ Full flow | Medium→**High** | No (CR→PR) | CR references embedding staleness, `.docuignore`, `dg reindex --force` ✅ | `type` always `user_request` (generic), severity over by one |
| DG-05 | ✅ Triaged | Low→**Normal** | No (awaiting-lead) | Billing team routing ✅, pro-rata credit KB referenced, excellent labels | — |
| DG-06 | ✅ Full flow | Normal→**Normal** | No (CR→PR) | GitHub issue auto-created ✅, `compatibility:"compatible"` fix unblocked Gemini 2.5 for PR draft, PR #125 on GitHub ✅ | `frequency_penalty`/`presence_penalty` rejected by Gemini OpenAI-compat endpoint (fixed in `llm-provider.ts`) |
| DG-07 | ✅ Full flow | Normal→**Normal** | **Yes** (after clarification) | Chat widget renders ✅, pre-chat form ✅, SSE connection ✅, auto-reply delivered in chat ✅ | pg-boss dispatch from API request context unreliable — jobs orphaned on backend restart (systemic, noted); chat widget shows silence when reply held for Lead (UX gap — fixed) |
| DG-08 | ✅ Full flow | Normal→**Low** | No (human routing) | Contact form widget ✅, triage category `Pre-sales`, routing to Sales ✅, `case.forwarded_to_team` event captured with context note ✅ | Missing "Route to Sales" Lead queue action (fixed mid-eval) |
| SS-01 | ✅ Awaiting-lead | High→**Critical** | No | Triage correct, evidence [1] found. Draft surfaced for Lead review via EmailReplyPanel | Email composer gap (fixed: DEFERRED-24), BullMQ detail not explicit in draft |
| SS-02 | ✅ Full flow | Critical→**Critical** | No (CR+PR) | Full pipeline → real GitHub PR ✅, hotfix context preserved in CR | PR branch name non-deterministic (fixed), `github_repo` not propagated retroactively (fixed) |
| SS-04 | ✅ Auto-resolved | Normal→**Normal** | **Yes** | DID migration KB surfaced, auto-reply sent, outbound signal stored ✅ | LLM key encryption mismatch (fixed), token budget too low for Gemini 2.5 (fixed) |
| SS-06 | ✅ Resolved | Critical→**Critical** | No (outage routing) | Batch verification API regression triaged correctly, critical severity ✅ | — |

### Bugs found and fixed during evaluation

| # | Bug | Root cause | Fix | Affected scenarios |
|---|-----|-----------|-----|--------------------|
| 1 | Outbound auto-reply not stored as signal | `auto-reply-worker` sends email but doesn't create outbound signal record | Added outbound signal creation in worker | DG-03, SS-04, all auto-resolvable |
| 2 | Severity over-triage for config questions | Token budget 800 too low → Gemini 2.5 truncates JSON → fallback defaults | Increased triage budget to 1500, auto_reply to 3000 | DG-03, SS-04 |
| 3 | LLM API key invalid after Settings save | Settings encrypts key, `getLlmProviderForProduct()` reads plaintext | Added `decryptSecret` fallback in `llm-provider.ts` | All product-LLM scenarios |
| 4 | Email FROM field rejected by Resend | `from` address format non-compliant | Fixed FROM format in email transport | DG-03, SS-04 |
| 5 | PR branch name non-deterministic | LLM generates different name each retry | Persist branch name on first PR draft, reuse on retry | SS-02 |
| 6 | CR missing `github_repo` | Not propagated from `ci_config` to CRs created before Settings update | Propagate at CR creation time | SS-02 |
| 7 | `known_issue_match` shows "0 tokens / success" | Correct abstention, but UI shows misleading metrics | UX: show "Skipped — no known issues" instead of zeros | All scenarios |
| 8 | LLM Provider model dropdown not loading | `frequency_penalty`/`presence_penalty` rejected by Gemini OpenAI-compat (HTTP 400) | `compatibility:"compatible"` on `createOpenAI()` provider | DG-06, PR draft scenarios |
| 9 | Chat widget shows silence when reply held for Lead | No auto-acknowledgement sent when `autoSend=false` | Added immediate acknowledgement message on `awaiting-lead` transition | DG-07, SS-07 |
| 10 | Missing "Route to Sales" action in Lead queue | State machine only had Route-to-Eng + Resolve for all cases | Added routing action driven by triage `routingTeam` field | DG-08 |
| 11 | pg-boss dispatch from API request context unreliable | Separate pg-boss client instance per request; jobs orphaned on backend restart | **Noted — not fixed.** Systemic: use shared worker-process pg-boss instance | DG-07, DG-08, all live channels |

### Pending scenarios (Phase 3)

| ID | Product | Channel | Notes |
|----|---------|---------|-------|
| DG-09 | DocuGardener | Internal | Knowledge capture (Growth tier gate) |
| SS-03 | SkillSeal | Email (re-channeled) | ZK workaround + infra CR |
| SS-05 | SkillSeal | Email | Reputation risk, sensitive case — human judgment |
| SS-07 | SkillSeal | Chat Widget | Escalation + operator SSE reply |
| SS-08 | SkillSeal | Scheduled | Monitoring alert, infrastructure triage |
| SS-09 | SkillSeal | Email | OU limit enforcement |
| XP-01 | Cross-product | Bridge | Cross-product doc drift |
| XP-02 | Cross-product | Email | Cross-product identity (requires DG-02 first) |
| XP-03 | Cross-product | Internal + Email | Memory ingest → retrieval loop |

---

## Intermediate Analysis (after 12/21 scenarios — 2026-03-24)

### Scorecard by evaluation dimension

| Dimension | Score | Completed evidence | Status |
|-----------|-------|--------------------|--------|
| **V1 — Time to triage** | 🟡 4/5 | Triage completes in 15–45s on Gemini 2.5 Flash. Accurate routing in 11/12. Severity over-triage in 5/12 (always 1 level high). | Good speed, calibration needs tuning |
| **V2 — AI response quality** | 🟢 4/5 | Auto-resolved cases (DG-03, SS-04, DG-07) produced accurate, actionable replies. KB evidence cited in 10/12. Generic `type: user_request` on all cases. | Strong — draft quality exceeds expectations |
| **V3 — Operator effort** | 🟢 4/5 | Auto-resolved: 0 clicks. Lead-queue cases: 2–4 actions (review draft → send → route/resolve). Sales inquiry required 2 clicks after fix. | Low effort for clear cases; complex flows need 1–2 extra steps |
| **V4 — Context completeness** | 🟡 3/5 | Triage labels + KB evidence present. Conversation thread shows inbound. Outbound reply now stored (fixed mid-eval). CR/PR/Issue links visible on case. Missing: `type` field meaningful values. | Adequate but `type` dimension is wasted today |
| **V5 — Channel round-trip** | 🟡 3/5 | Email: ✅ sent (Resend free tier limits). GitHub: ✅ issue + PR created. Chat: ✅ SSE reply delivered. Contact form: ✅ case created. Gap: pg-boss reliability means live channels need manual dispatch workaround. | Core channels work; reliability of dispatch is the blocker |
| **V6 — Escalation clarity** | 🟢 4/5 | Lead queue shows correct context. `case.forwarded_to_team` event with note ✅. CR carries full problem statement + KB context. Route-to-Sales added mid-eval. | Smooth when routing action matches case type |
| **V7 — CR utility** | 🟢 5/5 | All CRs (DG-02, DG-04, DG-06, SS-02) referenced correct KB, repo, blast radius, suggested fix. Real GitHub PR created with relevant title + branch. | Best performing dimension — CR content is consistently useful |
| **V8 — Resolution confirmation** | 🟡 3/5 | `resolved` status clear. But auto-resolved cases have no visible "resolved by AI" attribution in Console. `awaiting-lead` used as both "monitoring" and "pending reply" states — ambiguous. | Status model needs a split: `monitoring` vs `pending-reply` |

**Overall: 30/40 (75%) — Production-capable with known gaps**

---

### Key metrics (12 scenarios)

| Metric | Value | Benchmark |
|--------|-------|-----------|
| **Auto-resolution rate** | 3/12 (25%) | Expected ~30% for current KB coverage — ✅ on target |
| **Triage accuracy (routing)** | 11/12 (92%) | DG-08 routing correct after fix — strong |
| **Severity accuracy** | 7/12 (58%) | 5 cases over-triaged by 1 level — needs prompt tuning |
| **KB retrieval hit rate** | 10/12 (83%) | 2 misses: DG-07 widget (short message), SS-01 (BullMQ not surfaced explicitly) |
| **CR quality** | 4/4 (100%) | All CRs actionable for an engineer |
| **Real GitHub PRs created** | 3 (DG-02, SS-02, DG-06) | End-to-end GitHub integration confirmed ✅ |
| **Bugs found + fixed during eval** | 10 fixed, 1 noted | High density — eval served as integration test harness |
| **Pipeline reliability** | ~70% without manual dispatch | pg-boss issue affects all live-channel injections |

---

### How to read these results as a product owner

**What's working well (ship-ready):**
- **CR + PR pipeline** — the most complex flow works end-to-end reliably. An engineer can pick up a CR and act on it without reading the original ticket.
- **AI triage accuracy** — routing team correct in 92% of cases. Labels and KB evidence give operators immediate context.
- **Auto-reply quality** — when confidence gates pass, the reply is accurate and cites sources. Not a random LLM response.
- **Multi-channel intake** — email, GitHub, chat widget, contact form all working. Signal → case in < 2 seconds.

**What needs work before GA:**
- **pg-boss dispatch reliability** (#11) — the most critical unfixed issue. Every signal entering via a live channel (not inject script) risks getting stuck in `enriching`. This is a production blocker.
- **Severity calibration** — 58% accuracy is acceptable for beta (1 level off is not dangerous), but needs triage prompt tuning for production.
- **`type` field meaningless** — always `user_request`. Wastes a dimension that could drive UI filtering and reporting.
- **`awaiting-lead` dual meaning** — used for both "pending operator reply" and "monitoring after reply". Needs `monitoring` sub-state or split status.

**What to watch in the remaining 9 scenarios:**
- **SS-07** — second chat widget test. Will confirm or refute DG-07 pg-boss findings.
- **SS-08** — scheduled signal (monitoring/infra). Tests a completely different ingress path.
- **XP-01/XP-02** — cross-product flows. These are the highest-risk scenarios: identity collision and bridge events have no prior validation.
- **DG-09** — knowledge capture. Tests the learning flywheel — if this works, NestFleet improves over time.

---

## What We're Evaluating

For each scenario, measure:

| Dimension | Question |
|-----------|----------|
| **V1 — Time to triage** | How long from signal → severity + type assigned? Is triage accurate? |
| **V2 — AI response quality** | Does the AI response resolve the issue or does it add confusion? |
| **V3 — Operator effort** | How many clicks/actions does the operator need to take? |
| **V4 — Context completeness** | Does the operator have everything they need in the case view, or do they need to context-switch? |
| **V5 — Channel round-trip** | Does the reply land in the right place (GitHub issue, Slack thread, email thread, chat widget)? |
| **V6 — Escalation clarity** | Is the Lead handoff smooth? Does the Lead get enough context without re-reading everything? |
| **V7 — CR utility** | When a CR is created, does it carry enough context for an engineer to act? |
| **V8 — Resolution confirmation** | Is it clear when a case is actually resolved vs. just replied-to? |

---

## Implementation Plan — Option 3: Phased NestFleet-First Validation

### Rationale

We are testing **NestFleet**, not DocuGardener or SkillSeal. The 18 scenarios
describe support tickets *about* those products — NestFleet doesn't need
DocuGardener running to process a support email about DocuGardener's false-positive
bug. It needs: (1) signals arriving through real channels, (2) knowledge base
seeded with product docs, (3) products configured in NestFleet.

This phased approach validates NestFleet's core value before investing in
production deployment of the source products.

### Confirmed decisions (2026-03-20)

| # | Decision | Detail |
|---|----------|--------|
| 1 | Resource management | Agent has full control to start/stop services, manage Docker, manage ports |
| 2 | Gemini API key | Key lives in **DB** (`products.llm_config.apiKey`), NOT `.env`. Configured via Console → Settings → LLM Provider. `.env` is fallback only. When creating SkillSeal product, must configure LLM key through UI or seed script. |
| 3 | Injection script | Parameterized: `--scenario DG-01` for single, `--all` for batch, `--product dg` for one product |
| 4 | Email channel | Configure `alexeykopachev47@gmail.com` IMAP when ready (not blocking Phase 1) |
| 5 | GitHub webhook | Reuse DocuGardener's existing Smee channel (`https://smee.io/85AZjBVA8yAG1EBI`), repoint target to NestFleet `localhost:3001` when testing. One webhook at a time — no synthetic parallel routes |

### Tier impact analysis — Community plan limitations

The current license is **Community** tier. Several scenarios exercise features
that are gated behind higher tiers. This is itself a validation finding:
it proves the upsell value of paid tiers.

#### Hard blockers on Community

| Blocker | Required Tier | Affected Scenarios | Impact |
|---------|---------------|-------------------|--------|
| **Max 1 product** | Starter (3) | ALL — need DocuGardener + SkillSeal | Cannot create second product. **Must upgrade to Starter+ or use dev mode for eval.** |
| **Chat Widget** | Starter | DG-07, SS-07 | Feature flag `website_widget_channel` blocks channel |
| **Contact Form** | Starter | DG-08, SS-04 (if via form) | Likely gated with website widget |
| **Slack channel** | Growth | DG-03, SS-03 | Feature flag `slack_channel` blocks channel |
| **Auto-reply autonomous send** | Starter | DG-03, DG-07, SS-01, SS-03, SS-04 | Agent runs but ALWAYS → `awaiting-lead` (human approval required). V4 Deflection value = zero. |
| **Knowledge Capture** | Growth | Post-resolution learning | `GROWTH_GATED_ACTIONS` in dispatcher blocks dispatch |
| **Analytics (cost/perf/ops)** | Starter/Growth | Evaluation reporting | Cannot measure ROI with data |

#### Works on Community (no restrictions)

| Feature | Scenarios |
|---------|-----------|
| Email ingress | DG-02, DG-05, SS-01, SS-04, SS-05, SS-06, XP-02 |
| GitHub webhooks | DG-01, DG-04, DG-06, SS-02, SS-03 |
| AI Triage | All 18 (runs on all tiers) |
| Known-issue match | All applicable |
| Outage routing | SS-06, SS-08 |
| CR creation + PR drafts | All change-flow scenarios |
| Scheduled signals | SS-08, XP-01 |
| Approval workflows | All |
| Audit trail | All |

#### Resolution for beta eval

**Option A — Use dev mode:** When no license JWT is present, NestFleet treats the
instance as Scale tier (all features enabled). This is the recommended path for
local evaluation — it tests all features without artificial gates.
Verify: `getLicenseTier()` returns `"scale"` when `LICENSE_KEY` is unset in `.env`.

**Option B — Upgrade to Growth:** Unlocks all channels, autonomous auto-reply,
analytics, knowledge capture. Required for production evaluation but not for
local Phase 1–2.

**Decision:** Run Phase 1–2 in dev mode (no license key). This tests all features.
Document which scenarios would FAIL on Community as a pricing validation artifact.

#### Upsell proof matrix (pricing validation artifact)

This matrix proves which tier a real customer needs to get value from each scenario:

| Scenario | Community | Starter | Growth | Why upgrade? |
|----------|-----------|---------|--------|-------------|
| DG-01 (GitHub bug) | ✅ works | ✅ | ✅ | — |
| DG-02 (email critical) | ✅ works | ✅ | ✅ | — |
| DG-03 (config Q — re-channeled to email) | ✅ works (email) | ✅ | ✅ | In prod: Slack channel unlocks real-time automated config answers |
| DG-04 (GitHub RAG bug) | ✅ works | ✅ | ✅ | — |
| DG-05 (email billing) | ✅ works | ✅ | ✅ | — |
| DG-06 (GitHub setup crash) | ✅ works | ✅ | ✅ | — |
| DG-07 (chat widget) | ❌ no widget | ✅ | ✅ | Chat widget = instant trial-user support |
| DG-08 (contact form) | ❌ no form | ✅ | ✅ | Contact form = enterprise lead capture |
| SS-01 (email vault bug) | ⚠️ reply needs approval | ✅ auto | ✅ auto | Autonomous reply saves 10 min per case |
| SS-02 (GitHub regression) | ✅ works | ✅ | ✅ | — |
| SS-03 (ZK timeout — re-channeled to email) | ✅ works (email) | ✅ | ✅ | In prod: Slack channel unlocks real-time workaround delivery |
| SS-04 (email DID config) | ⚠️ reply needs approval | ✅ auto | ✅ auto | Autonomous send = instant DNS guide delivery |
| SS-05 (email reputation) | ✅ works (should NOT auto-reply) | ✅ | ✅ | — |
| SS-06 (email critical API) | ✅ works | ✅ | ✅ | — |
| SS-07 (chat widget mobile) | ❌ no widget | ✅ | ✅ | Chat = real-time support for interview-deadline user |
| SS-08 (scheduled monitoring) | ✅ works | ✅ | ✅ | — |
| XP-01 (bridge event) | ✅ works | ✅ | ✅ | — |
| XP-02 (cross-product identity) | ❌ 1 product limit | ✅ | ✅ | Multi-product = suite value proposition |

| DG-09 (knowledge capture) | ❌ Growth-gated | ❌ Growth-gated | ✅ | Knowledge capture agent = learning flywheel |
| SS-09 (OU limit test) | ✅ works | ✅ | ✅ | OU limits vary by tier — tests the constraint |
| XP-03 (memory ingest) | ✅ works | ✅ | ✅ | — |

**Summary (adjusted for re-channeled Slack):** Community gets 13/21 scenarios working. Starter unlocks 17/21. Growth unlocks 21/21.
This directly validates the pricing axis: channels + autonomous AI + multi-product + knowledge capture are the upsell levers. In production with Slack inbound, Community drops back to 11/21 (Slack scenarios blocked).

### Infrastructure baseline (as of 2026-03-20)

| Service | Status | Port |
|---------|--------|------|
| NestFleet PostgreSQL (pgvector) | Running (Docker) | 5434 |
| NestFleet Jaeger | Running (Docker) | 16686 / 4318 |
| NestFleet Backend | Ready to start | 3001 |
| NestFleet Console (Next.js) | Ready to start | 3002 |
| Smee (webhook proxy) | Installed globally, DocuGardener channel active | — |
| Gemini API key | In DB for DocuGardener product (39-char key, provider=`google`). `.env` has fallback key (provider=`openai` wrapper). DB takes priority via `getLlmProviderForProduct()`. | — |
| Email account | alexeykopachev47@gmail.com (configure IMAP for Phase 2) | — |

DocuGardener and SkillSeal do NOT need to be running for Phases 1–2.

---

### PHASE 1: NestFleet Setup + Signal Injection (Day 1, morning)

**Goal:** Validate triage accuracy, routing, CR creation, notification delivery,
and auto-reply quality for all 18 scenarios — without any channel integration.

#### Step 1.1 — Start NestFleet

```bash
# Terminal 1: Backend
cd /Users/Alexey_Kopachev/Alex/AI\ Projects/NestFleet
npm run dev                          # → http://localhost:3001

# Terminal 2: Console frontend
cd /Users/Alexey_Kopachev/Alex/AI\ Projects/NestFleet/console
npm run dev                          # → http://localhost:3002
```

**Verify:** Open http://localhost:3002 → login page loads.
**Verify:** `curl http://localhost:3001/api/v1/health` → `{"status":"ok"}`.

#### Step 1.2 — Create products via Console Setup Wizard

Open http://localhost:3002 → Setup Wizard (or Settings → Products).

**Product 1: DocuGardener**

| Field | Value |
|-------|-------|
| Name | DocuGardener |
| Slug | docugardener |
| GitHub Repo | alexey-kopachev/docugardener |
| Default Severity | normal |
| Auto-reply | Enabled |
| Quiet Hours | 20:00–08:00 UTC |
| Escalation Team | support_lead, product_lead |
| LLM Provider | Google |
| Chat Model | gemini-2.0-flash |
| Embedding Model | gemini-embedding-001 |
| API Key | (reuse existing Gemini key from .env) |

**Product 2: SkillSeal**

| Field | Value |
|-------|-------|
| Name | SkillSeal |
| Slug | skillseal |
| GitHub Repo | alexey-kopachev/skillseal |
| Default Severity | normal |
| Auto-reply | Enabled |
| Quiet Hours | 22:00–07:00 Europe/Berlin |
| Escalation Team | support_lead, change_lead |
| LLM Provider | Google |
| Chat Model | gemini-2.0-flash |
| Embedding Model | gemini-embedding-001 |
| API Key | (reuse existing Gemini key from .env) |

> **LLM Key config — important:**
> The API key is stored in **`products.llm_config.apiKey`** in the DB, NOT in `.env`.
> The `.env` key is only a fallback used when a product has no LLM config.
>
> - **DocuGardener** already has the key in DB (configured via UI, 39-char, provider=`google`). No action needed.
> - **SkillSeal** must have its key configured after creation:
>   - **Option A (UI):** Console → Settings → LLM Provider → paste Gemini key → Test Connection → Save
>   - **Option B (seed script):** Insert `llm_config` JSON directly with `apiKey` field via DB
>
> Verify with: `docker exec nestfleet-postgres psql -U nestfleet -d nestfleet -c "SELECT name, llm_config->>'provider', CASE WHEN llm_config->>'apiKey' IS NOT NULL THEN 'SET' ELSE 'MISSING' END FROM products;"`

**Verify:** Both products visible in Settings → Products list. Both show "Connected" in LLM Provider settings.
**Record:** `docugardener_product_id` and `skillseal_product_id` UUIDs for use in injection script.

#### Step 1.3 — Seed knowledge base

> **Prerequisite:** Both products must have their LLM key configured **before** running the seed script. The seed script calls `embedText()` which uses the product's embedding model. If a product's `llm_config.apiKey` is missing in DB, embeddings will fall back to the `.env` key (which may use a different provider/model). Verify with:
> ```bash
> docker exec nestfleet-postgres psql -U nestfleet -d nestfleet -c \
>   "SELECT name, llm_config->>'provider', CASE WHEN llm_config->>'apiKey' IS NOT NULL THEN 'SET' ELSE 'MISSING' END AS key_status FROM products;"
> ```
> Both products must show `SET`. If SkillSeal shows `MISSING`, configure its LLM key via Console → Settings → LLM Provider before proceeding.

Run `scripts/beta-eval/seed-knowledge.ts` to insert knowledge
entries into NestFleet's product memory as Tier 1 memory chunks with embeddings.

**DocuGardener KB entries (7 articles):**

| # | Title | Content Summary | Used By |
|---|-------|-----------------|---------|
| 1 | Configuring `.docuignore` | File patterns, `# dg-ignore` inline annotation, `.docugardener.yml` ignore section | DG-01 |
| 2 | Blast radius scoring | How drift scores are calculated, `scoring.internalOnly: ignore` option | DG-01 |
| 3 | Nightly rollup configuration | `rollup.consolidate: true`, `rollup.minDriftScore: 0.4`, per-repo settings in `.docugardener.yml` | DG-03 |
| 4 | Embedding refresh triggers | Manual re-index via CLI `dg reindex --branch`, automatic refresh on push to default branch, stale embedding detection | DG-04 |
| 5 | Upgrade billing policy | Stripe pro-rata credits on plan upgrade, expected charge calculation, how to request refund | DG-05 |
| 6 | GitHub Enterprise Server OAuth scopes | Required scopes: `repo`, `read:org`, `admin:repo_hook`; GHE-specific: `site_admin` not needed; troubleshooting "insufficient scope" error | DG-07 |
| 7 | AI Author Mode safety controls | Auto-merge criteria, link validation pre-merge, how to disable auto-merge per repo | XP-01 |

**SkillSeal KB entries (9 articles):**

| # | Title | Content Summary | Used By |
|---|-------|-----------------|---------|
| 1 | Credential claim to vault pipeline | Claim flow: email → link → identity confirm → Smart Account deploy → credential mint → vault display; typical delay: 30s–2min | SS-01 |
| 2 | BullMQ queue troubleshooting | How to check stuck jobs: Redis CLI `LLEN bull:credential-mint:wait`, manual retry via admin API, common failure: Redis memory pressure | SS-01 |
| 3 | Webhook payload changelog | v2.0.x → v2.1.0 changes: credentialId field, talentDid format; breaking changes flagged | SS-02 |
| 4 | ZK proof batch size limits | Groth16 proof generation: ~2s per candidate; batch limit recommendation: 10 with ZK selective disclosure; 30s worker timeout; workaround: split batches or use standard verification for large sets | SS-03 |
| 5 | DID domain migration | DNS TXT record format: `skillseal-verification=<token>`; steps: add TXT to new domain → re-trigger KYB from Issuer Command Center → wait 24-48h for DNS propagation; existing credentials remain valid | SS-04 |
| 6 | Meta-Skill synthesis criteria | Current logic: selects credentials by highest confidence score (not newest date); known limitation: deprecated skills may be included; workaround: manually exclude via Vault settings | SS-05 |
| 7 | Batch verification API reference | Endpoint: `/api/v1/credentials/verify-batch`; max batch size: 500; timeout: 60s; error codes: 400 (validation), 429 (rate limit), 500 (internal); regression history | SS-06 |
| 8 | Mobile wallet compatibility | iOS Safari 16+: WASM supported; Android Chrome 110+: WASM supported; known issue: Safari Private Browsing blocks IndexedDB (required for key storage); fallback: desktop wallet | SS-07 |
| 9 | Blockchain anchor retry policy | Base L2 gas estimation: EIP-1559, dynamic baseFee; retry strategy: 3 attempts with exponential backoff; fallback: queue for manual retry; monitoring alert threshold: >50% failure rate in 1h window | SS-08 |

**Verify:** Console → Knowledge tab shows entries for both products.

#### Step 1.4 — Create signal injection script

Create `scripts/beta-eval/inject-signals.ts` — a TypeScript script that:
1. Reads product IDs from env or CLI args
2. For each of the 18 scenarios, POSTs to `POST /api/v1/products/:productId/signals` with:
   - `source_type`: email | github_webhook | slack | chat | contact_form | scheduled
   - `normalized_payload`: { fromEmail, subject, body/signalText } matching the scenario signal content
   - `source_ref`: unique ID per scenario to prevent dedup collisions on re-runs
3. Waits 5s between signals (allows triage pipeline to process each one)
4. Logs: signal_id, case_id created, triage result (poll case status)

**Scenario → signal mapping:**

| # | Scenario | product | source_type | fromEmail | subject (excerpt) |
|---|----------|---------|-------------|-----------|-------------------|
| 1 | DG-01 | docugardener | github_webhook | marcus@fintech.io | False positive blocking release |
| 2 | DG-02 | docugardener | email | sarah.chen@medcore.io | URGENT - Compliance export not working |
| 3 | DG-03 | docugardener | email (re-channeled from Slack) | priya@scaleup.io | nightly rollup creating 8+ issues |
| 4 | DG-04 | docugardener | github_webhook | daniel@backend.dev | Inconsistent drift scores |
| 5 | DG-05 | docugardener | email | raj.patel@buildfast.io | Billing question — charged full month |
| 6 | DG-06 | docugardener | github_webhook | alex@oss.dev | Setup wizard crashes on large orgs |
| 7 | DG-07 | docugardener | chat | trial-user@eval.io | OAuth flow insufficient scope |
| 8 | DG-08 | docugardener | contact_form | j.walsh@bigcorp.com | SOC2 compliance, on-premise |
| 9 | SS-01 | skillseal | email | amara.diallo@gmail.com | Re: credential ready to claim |
| 10 | SS-02 | skillseal | github_webhook | viktor@talenthub.io | Webhook payload missing credentialId |
| 11 | SS-03 | skillseal | email (re-channeled from Slack) | claire@techcorp.com | batch ZK verification timing out |
| 12 | SS-04 | skillseal | email | j.hartley@northamptonuniversity.edu | credentials showing issuer verification failed |
| 13 | SS-05 | skillseal | email | marco.rossi@protonmail.com | Auto-generated credential outdated skills |
| 14 | SS-06 | skillseal | email | ops@talentbridge.co | CRITICAL: Batch verification API broken |
| 15 | SS-07 | skillseal | chat | user@mobile.test | Generate Proof button not working |
| 16 | SS-08 | skillseal | scheduled | monitoring@skillseal.internal | Blockchain anchor failure rate > 50% |
| 17 | XP-01 | docugardener | scheduled | bridge@nestfleet.internal | bridge.doc-gap.detected |
| 18 | XP-02 | skillseal | email | sarah.chen@medcore.io | Need to bulk-import credentials (requires DG-02 first) |

**CLI interface:**
```bash
cd /Users/Alexey_Kopachev/Alex/AI\ Projects/NestFleet

# Run a single scenario
npx tsx scripts/beta-eval/inject-signals.ts --scenario DG-01

# Run all scenarios for one product
npx tsx scripts/beta-eval/inject-signals.ts --product dg
npx tsx scripts/beta-eval/inject-signals.ts --product ss

# Run all 18 scenarios (5s pause between each)
npx tsx scripts/beta-eval/inject-signals.ts --all

# Run cross-product scenarios only
npx tsx scripts/beta-eval/inject-signals.ts --product xp

# Override product IDs (auto-detected from DB by default)
npx tsx scripts/beta-eval/inject-signals.ts --all \
  --dg-product-id <uuid> --ss-product-id <uuid>

# Dry-run: print payloads without sending
npx tsx scripts/beta-eval/inject-signals.ts --all --dry-run
```

The script auto-discovers product IDs by querying NestFleet's DB for products
with slugs `docugardener` and `skillseal`. Override with explicit flags if needed.

#### Step 1.5 — Collect Phase 1 results

After all 18 signals are injected and the triage pipeline has processed them
(allow ~5 min for all agents to complete):

1. Open Console → Cases tab → verify 18 cases created
2. For each case, record in the evaluation sheet:

**Triage Quality (Phase 2 matrix):**

| Scenario | Expected Severity | Actual | Expected Type | Actual | ✅/⚠️/❌ |
|----------|-------------------|--------|---------------|--------|-----------|
| DG-01 | high | | bug_report | | |
| DG-02 | high (or critical) | | bug_report | | |
| DG-03 | low | | user_request | | |
| DG-04 | normal | | bug_report | | |
| DG-05 | low | | user_request | | |
| DG-06 | normal | | bug_report | | |
| DG-07 | normal | | user_request | | |
| DG-08 | normal | | user_request | | |
| SS-01 | high | | bug_report | | |
| SS-02 | critical | | bug_report | | |
| SS-03 | high | | bug_report | | |
| SS-04 | normal | | user_request | | |
| SS-05 | medium (or high) | | bug_report | | |
| SS-06 | critical | | bug_report | | |
| SS-07 | high | | bug_report | | |
| SS-08 | critical | | outage_report | | |
| XP-01 | low | | user_feedback | | |
| XP-02 | normal | | user_request | | |

**Routing Accuracy (Phase 3 matrix):**

| Scenario | Expected Route | Actual | Override? | Time |
|----------|---------------|--------|-----------|------|
| DG-01 | in-change (CR) | | | |
| DG-02 | awaiting-lead (escalation) | | | |
| DG-03 | auto-reply → resolved | | | |
| DG-04 | in-resolution → CR | | | |
| DG-05 | awaiting-lead (billing) | | | |
| DG-06 | in-change (CR) | | | |
| DG-07 | auto-reply → resolved | | | |
| DG-08 | awaiting-lead (sales) | | | |
| SS-01 | auto-reply + monitor | | | |
| SS-02 | awaiting-lead (critical) | | | |
| SS-03 | auto-reply + CR | | | |
| SS-04 | auto-reply → resolved | | | |
| SS-05 | awaiting-lead (sensitive) | | | |
| SS-06 | awaiting-lead (critical) | | | |
| SS-07 | awaiting-lead (investigation) | | | |
| SS-08 | awaiting-lead (outage) | | | |
| XP-01 | knowledge-lead | | | |
| XP-02 | normal processing | | | |

**Output Quality (Phase 4 matrix):**

| Scenario | Output Type | Actionable? | Tone? | Missing Info? |
|----------|-------------|-------------|-------|---------------|
| DG-01 | auto-reply + CR | | | |
| DG-02 | holding response | | | |
| DG-03 | config YAML snippet | | | |
| DG-04 | partial reply + clarification | | | |
| DG-05 | billing explanation | | | |
| DG-06 | ack + CR | | | |
| DG-07 | OAuth scope guidance | | | |
| DG-08 | sales ack only | | | |
| SS-01 | queue status + retry | | | |
| SS-02 | escalation notice | | | |
| SS-03 | batch-split workaround | | | |
| SS-04 | DNS TXT record steps | | | |
| SS-05 | empathetic ack (no auto-fix) | | | |
| SS-06 | critical ack | | | |
| SS-07 | ack + escalation | | | |
| SS-08 | N/A (internal) | | | |
| XP-01 | knowledge badge | | | |
| XP-02 | standard processing | | | |

**End-to-End Cycle Time (Phase 5 matrix):**

| Scenario | Signal→Triage | Triage→Route | Route→CR | CR→Approve | Approve→PR | Total |
|----------|--------------|--------------|----------|------------|------------|-------|
| DG-01 | | | | | | |
| DG-02 | | | | N/A | N/A | |
| ... | | | | | | |

**Value Verdict (Phase 6 matrix):**

| Scenario | V1 Speed | V2 Accuracy | V3 Governance | V4 Deflection | V5 Suite | Overall |
|----------|----------|-------------|---------------|---------------|----------|---------|
| DG-01 | | | | | | |
| ... | | | | | | |

---

### PHASE 2: Real Channel Testing (Day 1, afternoon)

**Goal:** Validate that each of the 7 channel adapters correctly ingests signals
end-to-end. One representative scenario per channel.

#### Step 2.1 — Email channel (DG-02)

**Prereqs:**
- NestFleet email ingress configured to poll `alexeykopachev47@gmail.com`
- Check `.env`: `EMAIL_IMAP_HOST`, `EMAIL_IMAP_USER`, `EMAIL_IMAP_PASSWORD` are set
- If not configured yet: open Console → Settings → Channels → Email → configure IMAP polling

**Steps:**
1. Send an email from a different email address (or use Gmail's `+` alias: `alexeykopachev47+sarah@gmail.com`) to the configured inbox
2. Subject: `URGENT - Compliance export not working, audit Monday`
3. Body: Use the exact DG-02 signal content from the scenario
4. Wait for NestFleet's IMAP poller to pick it up (check polling interval in config, default: 60s)
5. Verify: Console → Cases → new case created from email signal
6. Verify: `source_type = email`, sender extracted, subject parsed

**Record:**
- Time from email sent → case created: ___
- Signal fields correctly extracted: ✅/❌
- Email thread ID preserved for reply: ✅/❌

#### Step 2.2 — GitHub webhook channel (DG-01)

**Prereqs:**
- Repoint DocuGardener's existing Smee channel to NestFleet (one webhook at a time)
- Smee URL: `https://smee.io/85AZjBVA8yAG1EBI`
- DocuGardener's Smee container must be stopped first to avoid two consumers

**Steps:**
1. Stop DocuGardener's Smee consumer (it currently forwards to `localhost:8000`):
   ```bash
   docker stop docugardener-smee  # or the actual container name
   ```
2. Start Smee proxy pointed at NestFleet:
   ```bash
   smee --url https://smee.io/85AZjBVA8yAG1EBI \
        --target http://localhost:3001/api/v1/webhooks/github
   ```
3. Open `https://github.com/alexey-kopachev/docugardener/issues/new`
4. Title: `[BETA-TEST] False positive blocking release — internal refactor flagged as doc drift`
5. Body: Use exact DG-01 signal content from the scenario
6. Submit issue → GitHub fires webhook → Smee proxies to NestFleet on 3001
7. Verify: Console → Cases → new case from GitHub webhook

**Record:**
- Smee relay latency: ___
- Issue number extracted: ✅/❌
- Repo and author extracted: ✅/❌
- Can NestFleet reply back to the GitHub issue? ✅/❌

**Cleanup:**
- Close the test issue (prefixed `[BETA-TEST]` for easy identification)
- When done with GitHub channel testing, stop the Smee proxy and optionally
  restart DocuGardener's consumer:
  ```bash
  docker start docugardener-smee
  ```

#### Step 2.3 — Chat Widget channel (DG-07)

**Prereqs:**
- Chat widget enabled in NestFleet console for the DocuGardener product
- Console → Settings → Chat Widget → Enabled, welcome message set

**Steps:**
1. Open a new browser tab (incognito recommended) to `http://localhost:3002`
2. Navigate to the chat widget (bottom-right corner or dedicated page)
3. Type the DG-07 message: "Hi, I'm trying to connect DocuGardener to my private GitHub repos but the OAuth flow keeps failing with insufficient scope..."
4. Send message
5. Observe: signal created, case created, auto-reply appears in chat

**Record:**
- Time from message sent → auto-reply received: ___ (target: <60s)
- Reply content: specific OAuth guidance or generic ack?
- SSE stream stable: ✅/❌

#### Step 2.4 — Contact Form channel (DG-08)

**Prereqs:**
- Contact form widget enabled for DocuGardener product
- Check if contact form endpoint exists: `POST /api/v1/products/:productId/signals/contact-form`

**Steps:**
1. Submit via cURL or browser:
   ```bash
   curl -X POST http://localhost:3001/api/v1/products/<dg_product_id>/signals/contact-form \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Jennifer Walsh",
       "email": "j.walsh@bigcorp.com",
       "company": "BigCorp Financial",
       "message": "We are evaluating documentation tools for our engineering org (2000+ developers). Key requirements: SOC2 Type II compliance, on-premise deployment, SAML SSO integration."
     }'
   ```
2. Verify: Console → Cases → new case, `source_type = contact_form`
3. Verify: company name and email preserved in signal metadata

**Record:**
- Form fields extracted: ✅/❌
- Routed to awaiting-lead (not auto-resolved): ✅/❌

#### Step 2.5 — Slack channel (DG-03) — optional

**Prereqs:**
- Slack workspace with NestFleet bot installed
- Slack webhook URL configured in Console → Settings → Notification Channels → Slack
- If Slack inbound is not yet implemented: **skip and note as gap**

**Steps (if available):**
1. Post in configured Slack channel: `@nestfleet-support the nightly rollup is creating 8+ GitHub issues per night...`
2. Verify: signal created from Slack message
3. Verify: reply posted back to Slack thread

**If Slack inbound not available:**
- Record as known gap
- Note: Slack outbound (notifications) can still be tested — send a test notification from Console

#### Step 2.6 — Scheduled / Bridge channel (SS-08, XP-01)

**Prereqs:** None — internal signal injection, no external service needed.

**Steps:**
1. Inject SS-08 (monitoring alert) via API:
   ```bash
   curl -X POST http://localhost:3001/api/v1/products/<ss_product_id>/signals \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <admin_token>" \
     -d '{
       "source_type": "scheduled",
       "source_ref": "beta-eval-ss08-monitoring",
       "normalized_payload": {
         "fromEmail": "monitoring@skillseal.internal",
         "subject": "Alert: Blockchain anchor failure rate > 50%",
         "signalText": "Component: credential-anchor-service\nError: Transaction underpriced (gas estimation failed)\nAffected: 23 pending credential issuances in last hour\nNetwork: Base L2 (chainId: 8453)"
       }
     }'
   ```
2. Verify: case created, severity=critical, outage routing triggered
3. Verify: notification sent immediately (bypass quiet hours)

**Record:**
- Outage routing agent activated: ✅/❌
- Quiet hours bypassed for critical: ✅/❌

#### Step 2.7 — Phase 2 summary

Fill the channel verification matrix:

| Channel | Scenario | Signal Created | Case Created | Triage Ran | Reply Delivered | Notes |
|---------|----------|---------------|--------------|------------|-----------------|-------|
| Email | DG-02 | | | | | |
| GitHub | DG-01 | | | | | |
| Chat Widget | DG-07 | | | | | |
| Contact Form | DG-08 | | | | | |
| Slack | DG-03 | | | | | |
| Scheduled | SS-08 | | | | | |
| Bridge | XP-01 | | | | | |

---

### PHASE 3: Decision Gate

**Goal:** Evaluate Phase 1 + Phase 2 results against success criteria and decide
whether to proceed to production deployment.

#### Step 3.1 — Compute metrics

From the Phase 1+2 evaluation matrices, calculate:

| Metric | Target | Actual | Pass? |
|--------|--------|--------|-------|
| Triage accuracy (severity + type) | ≥ 80% (≥15/18) | /18 | |
| Routing accuracy | ≥ 70% (≥13/18) | /18 | |
| Auto-reply usefulness | ≥ 50% of eligible | /8 eligible | |
| E2E cycle time (signal → CR) | ≤ 5 min | avg: | |
| Chat response time | ≤ 60s | | |
| Critical cases notified immediately | 100% (4/4) | /4 | |
| Zero data loss | 0 signals lost | /18 | |
| Governance (audit trail complete) | 100% | /18 | |
| Channel round-trip | 100% | /7 channels | |

#### Step 3.2 — Decision

| Result | Criteria | Next Action |
|--------|----------|-------------|
| **GREEN** | ≥80% triage, ≥70% routing, all critical metrics pass | → Phase 4: Deploy DocuGardener to Hetzner, link to NestFleet in prod |
| **YELLOW** | 60–80% triage OR 50–70% routing | → Fix: tune triage prompts, seed more KB, adjust routing rules. Re-run failed scenarios. Then re-evaluate. |
| **RED** | <60% triage OR <50% routing OR data loss | → Fundamental issues: rearchitect triage/routing before any deployment investment |

#### Step 3.3 — Document findings

For each ⚠️ Partial or ❌ Fail result, document:

```
Scenario: DG-XX
Step: [triage | routing | auto-reply | notification | CR]
Expected: ...
Actual: ...
Root cause: [prompt gap | KB missing | routing rule | code bug | channel adapter]
Fix: [specific action]
Priority: [P0 blocker | P1 before prod | P2 nice-to-have]
```

---

### PHASE 4: Production Deployment (Day 3+, only if Phase 3 = GREEN)

**Goal:** Deploy DocuGardener to Hetzner, connect real traffic to NestFleet.

#### Step 4.1 — DocuGardener domain and email setup

| Task | Details | Done? |
|------|---------|-------|
| Register domain | docugardener.io (or .dev / .app) | |
| Configure DNS | A record → Hetzner VPS IP, MX records for email | |
| Set up email | support@docugardener.io (Postmark or Resend) | |
| TLS certificate | Let's Encrypt via Certbot or Caddy auto-TLS | |
| Wait for DNS propagation | 24–48h | |

#### Step 4.2 — Hetzner deployment

| Task | Details | Done? |
|------|---------|-------|
| Provision Hetzner VPS | CX21 or CX31 (2–4 vCPU, 4–8 GB RAM) | |
| Install Docker + Compose | Standard Docker CE install | |
| Clone DocuGardener repo | `git clone` to VPS | |
| Configure `.env.production` | DB, Redis, Weaviate, GitHub App, LLM keys | |
| Start services | `docker compose -f docker-compose.prod.yml up -d` | |
| Verify health | `curl https://docugardener.io/health` | |
| Configure GitHub App webhook | Point to `https://docugardener.io/webhooks/github` (no more Smee) | |

#### Step 4.3 — Connect DocuGardener to NestFleet

| Task | Details | Done? |
|------|---------|-------|
| Update NestFleet DocuGardener product | Set email to `support@docugardener.io` | |
| Configure GitHub webhook | Add NestFleet webhook to DocuGardener repo → production NestFleet URL | |
| Configure Slack integration | Connect operator Slack channel | |
| Embed chat widget | Add NestFleet chat widget script to DocuGardener dashboard | |
| Embed contact form | Add NestFleet contact form to DocuGardener landing page | |
| Test each channel | Re-run Phase 2 scenarios with production channels | |

#### Step 4.4 — Re-run scenarios with real traffic

Repeat the 18 scenarios, now with:
- Real email delivery (not IMAP polling of personal inbox)
- Real GitHub webhooks (not Smee proxy)
- Real Slack bot (not manual injection)
- Real chat widget on production DocuGardener site

Compare results with Phase 1 baselines. Record delta.

---

### PHASE 5: SkillSeal Evaluation (Day 5+, parallel with Phase 4)

**Goal:** Validate SkillSeal scenarios with the same approach.

#### Step 5.1 — SkillSeal local startup

```bash
cd /Users/Alexey_Kopachev/Alex/AI\ Projects/SkillSeal

# Fix port conflict: ensure nothing on 3000
lsof -i :3000 | grep LISTEN && kill <PID>

# Start SkillSeal stack
docker compose up -d
```

#### Step 5.2 — Connect SkillSeal to NestFleet

Same pattern as Phase 4.3 but for SkillSeal:
- GitHub webhook from SkillSeal repo → NestFleet
- Email: configure support@skillseal.io or use personal email alias
- Chat widget: embed in SkillSeal's frontend

#### Step 5.3 — Run SS-01 through SS-08 with real channels

Re-run the 8 SkillSeal scenarios through actual channel adapters.
Compare with Phase 1 injection baselines.

---

## Flow Optimization Triggers

After running all scenarios, flag any step where:

1. **Manual override was required** — indicates triage/routing logic gap
2. **Wrong severity** — adjust triage prompt or add severity heuristics
3. **Useless auto-reply** — knowledge base gap or confidence threshold too low
4. **Slow notification** — quiet hours misconfiguration or channel issue
5. **CR missing context** — change_prep agent needs more signal metadata
6. **PR draft not actionable** — pr_draft_prep needs better codebase context
7. **No value added** — the step could be skipped entirely (overhead > benefit)

### Decision matrix post-evaluation

| Optimization | Trigger | Action |
|--------------|---------|--------|
| Triage prompt tuning | ≥ 3 wrong severity | Adjust few-shot examples in triage prompt |
| Knowledge base seeding | ≥ 2 empty auto-replies | Seed with product FAQ, setup guides |
| Channel priority | Latency > 5min on chat | Review chat → signal → triage pipeline |
| Severity heuristics | "$" or "deadline" missed | Add keyword boosters to triage |
| Routing rules | ≥ 2 wrong routes | Add case-type → team mapping rules |
| Auto-reply gate | Low-confidence replies sent | Raise confidence threshold from 0.85 |
| Bridge validation | Bridge events lost | End-to-end bridge smoke test |
| Sales vs. support | ≥ 1 sales inquiry auto-resolved | Add sales-inquiry detection to triage |
| Recurring pattern | "third time" not detected | Add recurrence detection heuristic |

---

## Seed Data Requirements

To run these scenarios, NestFleet needs two products configured:

### Product 1: DocuGardener
```json
{
  "name": "DocuGardener",
  "slug": "docugardener",
  "support_policy": {
    "github_repo": "alexey-kopachev/docugardener",
    "default_severity": "normal",
    "auto_reply_enabled": true,
    "quiet_hours": { "start": "20:00", "end": "08:00", "timezone": "UTC" },
    "escalation_team": ["support_lead", "product_lead"]
  },
  "llm_config": {
    "provider": "google",
    "model": "gemini-2.0-flash",
    "embeddingModel": "gemini-embedding-001"
  }
}
```

### Product 2: SkillSeal
```json
{
  "name": "SkillSeal",
  "slug": "skillseal",
  "support_policy": {
    "github_repo": "alexey-kopachev/skillseal",
    "default_severity": "normal",
    "auto_reply_enabled": true,
    "quiet_hours": { "start": "22:00", "end": "07:00", "timezone": "Europe/Berlin" },
    "escalation_team": ["support_lead", "change_lead"]
  },
  "llm_config": {
    "provider": "google",
    "model": "gemini-2.0-flash",
    "embeddingModel": "gemini-embedding-001"
  }
}
```

### Knowledge Base Seeds

Each product needs minimum knowledge entries for auto-reply testing.
Full content for each article is specified in Phase 1, Step 1.3 above.

**DocuGardener (7 articles):**
- `.docuignore` configuration guide (DG-01)
- Blast radius scoring configuration (DG-01)
- Nightly rollup YAML configuration reference (DG-03)
- Embedding refresh / re-index trigger docs (DG-04)
- Upgrade billing policy — Stripe pro-rata (DG-05)
- GitHub Enterprise Server OAuth scope requirements (DG-07)
- AI Author Mode safety controls documentation (XP-01)

**SkillSeal (9 articles):**
- Credential claim → vault delivery pipeline (SS-01)
- BullMQ queue health troubleshooting (SS-01)
- Webhook payload schema changelog by version (SS-02)
- ZK proof batch size limits and Groth16 timeouts (SS-03)
- DID domain migration / DNS TXT record procedure (SS-04)
- Meta-Skill synthesis criteria and credential selection logic (SS-05)
- Batch verification API limits and error codes (SS-06)
- Mobile wallet browser compatibility matrix (SS-07)
- Blockchain anchor retry policy and gas estimation (SS-08)

---

## Success Criteria for Beta

| Metric | Target | Measurement |
|--------|--------|-------------|
| Triage accuracy | ≥ 80% correct severity + type | Manual review of 18 scenarios |
| Routing accuracy | ≥ 70% correct route without override | Manual review |
| Auto-reply usefulness | ≥ 50% of eligible cases get useful reply | Evaluator judgment (eligible: DG-01,03,04,05,07; SS-01,03,04) |
| End-to-end cycle time | ≤ 5 min signal → CR for change cases | Timestamp diff |
| Chat response time | ≤ 60s for chat widget cases (DG-07, SS-07) | Timestamp diff |
| Critical escalation | 100% of critical cases notified immediately | Notification log (DG-02, SS-02, SS-06, SS-08) |
| Zero data loss | 0 signals lost or misrouted | Audit trail |
| Governance completeness | 100% of cases have full audit trail | DB query |
| Channel round-trip | 100% replies land in originating channel | Manual verification |
| Cross-product linking | XP-02 identity correctly linked | Manual verification |

---

## Timeline Summary

| Phase | What | Duration | Depends On |
|-------|------|----------|------------|
| **Phase 1** | NestFleet setup + seed + inject 18 signals | **4–6 hours** | NestFleet running, Gemini key active |
| **Phase 2** | Real channel testing (1 scenario per channel) | **2–4 hours** | Phase 1 complete, email/GitHub/Smee configured |
| **Phase 3** | Decision gate — evaluate results | **1–2 hours** | Phase 1+2 data collected |
| **Phase 4** | DocuGardener prod deployment (if GREEN) | **2–3 days** | Domain, Hetzner, DNS propagation |
| **Phase 5** | SkillSeal evaluation (parallel) | **1 day** | Docker compose, port cleanup |

**Total to first results:** ~1 day (Phases 1–3).
**Total to production:** ~4–5 days (if Phase 3 = GREEN).

---

## Extended Scenarios — Actor Daily Workflows

> **Added 2026-03-24.** These scenarios cover actor-triggered flows and state machine paths not exercised by the original 21 beta scenarios. The goal is not to invent new features but to validate that every actor (Operator, Support Lead, Change Lead, Knowledge Lead) can complete real daily work without hitting untested code paths.
>
> **Gap analysis basis:** State machine review (case-state-machine.ts + cr-state-machine.ts), API route audit (cases.ts, approvals.ts, knowledge-assets.ts), and intermediate eval analysis (12/21 scenarios completed).
>
> Scenario IDs use the `NF-` prefix to distinguish from product-named scenarios.

---

### NF-01 · "Change Lead Reviews Infra-Debt Sidecar CR" · Console (Approvals Queue) · Normal Priority

> **Prerequisite:** SS-03 must be completed first. The Steward creates a sidecar CR with `cr_track: "infra_debt"` after the ZK batch timeout case auto-resolves via the known-issue workaround path.

**Persona:** Alex, Change Lead at SkillSeal. Logs in the morning after the SS-03 eval run. The ZK proof case was already resolved by the Steward (Claire got her workaround). Alex opens the Approvals queue and sees a new CR they did not expect — it has an orange **Infra Debt** badge.

**Trigger:**
No new inbound signal. Alex opens `Console → Approvals` to review the day's queue.

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Approvals queue load | `GET /change-requests/pending-approval` lists all CRs in `approval-pending` | Sidecar CR from SS-03 appears in the list |
| 2. Infra Debt badge | CR row shows orange **Infra Debt** badge (cr_track="infra_debt") | Badge renders correctly; distinct from standard CRs |
| 3. CR detail | Alex opens the CR → sees title: "[Infra debt] ZK proof timeout on batch > 5", `status: approval-pending`, `risk_level: medium` | problem_statement from triage reasoning visible |
| 4. Decoupled lifecycle note | CR detail makes clear the associated case is already `resolved` — the infra fix is independent | Operator understands context without confusion |
| 5. Approval | Alex clicks Approve → `POST /change-requests/:crId/approve` | CR → `approved` → `implementation-prep` |
| 6. Dispatch | `change_prep` or `pr-draft-prep` dispatched for sidecar CR | PR draft generated for infra fix |
| 7. Notification | Change Lead receives no re-notification — they're already acting | No duplicate Slack ping on own approval |

**Evaluation checkpoints:**
- Does the orange **Infra Debt** badge appear in the Approvals queue row?
- Does the CR detail view show the sidecar context (case already resolved, infra fix independent)?
- Can the Change Lead approve a sidecar CR with `cr_track="infra_debt"` exactly the same way as a regular CR?
- Does the CR progress to `implementation-prep` after approval?
- Does the approval flow work even when the linked case is already in `resolved` status?

**Expected outcome:** Change Lead approves the infra-debt CR within 5 minutes of opening the queue. PR drafted for the ZK worker timeout fix. No confusion about why the linked case is already closed — the decoupled lifecycle is clear from the UI.

---

### NF-02 · "Change Lead Rejects CR — Risk Understated" · Console (Approvals Queue) · Normal Priority

> **Prerequisite:** Any CR in `approval-pending` with a risk_level that looks understated on inspection. Use DG-04's CR ("Fix embedding staleness in RAG pipeline") or create a new one.

**Persona:** Alex, Change Lead. Reviewing the DG-04 CR in `approval-pending`. The AI set `risk_level: medium` but Alex sees that the CR modifies the embedding pipeline — a shared service — and considers the risk to be high.

**Trigger:**
Alex opens the Approvals queue, reviews the DG-04 CR, and decides to reject it with a rationale.

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Load CR | `GET /change-requests/:crId` — Alex reads the CR content | risk_level=medium is visible |
| 2. Reject action | Alex clicks Reject → sees rejection modal with rationale textarea | Modal requires minimum 10-character rationale |
| 3. Submit rejection | `POST /change-requests/:crId/reject` with body `{ rationale: "Risk level should be high — modifies shared embedding pipeline; needs staging rollout plan" }` | 400 if rationale < 10 chars |
| 4. State transition | CR → `rejected` (terminal state) | `approved`, `implementation-prep` etc. no longer reachable |
| 5. Audit event | `change_request.rejected` audit event created with rationale | Audit trail preserved |
| 6. Notification | Operator/case owner notified: CR rejected with rationale | Case may return to `awaiting-lead` or `in-change` depending on configuration |
| 7. Re-route | Does the case need to return to `in-change` for a revised CR? | No automatic re-routing — operator decides next step manually |

**Evaluation checkpoints:**
- Does the reject API enforce the 10-character minimum on rationale?
- Is the `rejected` status correctly treated as terminal (no further transitions possible)?
- Is the rejection rationale visible in the case audit trail?
- Is the operator notified of the rejection with the rationale text (not just "CR rejected")?
- Can the operator create a new CR for the same case after the first one is rejected?

**Expected outcome:** CR is permanently rejected. Rationale preserved in audit trail. Operator informed and able to create a revised CR with corrected risk assessment.

---

### NF-03 · "Customer Re-Opens Resolved Case via Follow-Up Email" · Email · Normal Severity

> **Prerequisite:** DG-03 must be in `resolved` status (auto-resolved by AI with rollup config answer).

**Persona:** Priya, the DocuGardener customer from DG-03. The AI workaround (set `rollup.consolidate: true`) helped initially, but the nightly rollup is still creating 3 extra issues for a specific repo. She replies to the original resolved email thread.

**Trigger:**
Priya replies to the email thread from DG-03 with a follow-up question.

**Inbound signal — Email:**
```
From: priya@scaleup.io
To: support@docugardener.io
Subject: Re: nightly rollup configuration question

Hi,

The consolidation setting helped reduce the noise from 8 down to 3, but
the "scaleup/core-services" repo is still creating duplicate issues for
minor drift (< 0.2 score). I have `minDriftScore: 0.4` set globally but
it seems to be ignored for this specific repo.

Is there a per-repo override for the minimum drift score threshold?

Priya
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Email arrives, `fromEmail=priya@scaleup.io` | Thread-ID correlation matches DG-03 case |
| 2. Case re-open | DG-03 case is `resolved` → new signal triggers `resolved` → `awaiting-user` transition | Case re-opens with new signal linked to existing conversation thread |
| 3. Conversation thread | Operator opens case → sees full thread: original signal + AI reply + Priya's follow-up | Thread continuity preserved |
| 4. Triage | New signal triaged in context of existing case | Should NOT create a duplicate case |
| 5. AI response | AI searches KB for "per-repo minDriftScore override" → draft generated | Ideally answers: per-repo config in `.docugardener.yml` under `repos:` key |
| 6. Lead handling | If auto-send: resolved again. If held: Lead sees updated conversation in EmailReplyPanel | |
| 7. Case status | Resolves again (or stays `awaiting-lead` if manual) | Case closes cleanly for second time |

**Evaluation checkpoints:**
- Does the new email correctly re-open the resolved DG-03 case rather than creating a new unlinked case?
- Is the `resolved` → `awaiting-user` transition triggered by the new inbound signal?
- Is the full conversation thread (original signal + AI reply + follow-up) visible in the case view?
- Does the AI response to the follow-up have context from the original resolution (it's a related but distinct question)?
- If a new case IS created instead of re-opening: is the duplicate detectable from the operator queue, and is there a link between the two cases?

**Expected outcome:** Priya's follow-up lands in the same case thread. Operator has full conversation context. AI provides per-repo config answer. Case resolves cleanly a second time.

---

### NF-04 · "Lead Asks Customer for Clarification — awaiting-user Cycle" · Email · Normal Severity

> Tests the `draft-clarification` → `awaiting-user` → `signal-received` → re-triage cycle. Uses DG-05 (billing dispute) where the AI doesn't know Raj's Stripe subscription ID to look up his charge.

**Persona:** Support Lead reviewing DG-05 (Raj's billing complaint). The Lead needs Raj's Stripe Customer ID or subscription ID to check the pro-rata calculation. The AI draft doesn't ask for this — the Lead must request it.

**Trigger:**
Lead opens the DG-05 case in `awaiting-lead`, decides to ask Raj for his subscription details before sending a reply.

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Case state | DG-05 is `awaiting-lead` | Lead has it open in queue |
| 2. Draft clarification | Lead clicks "Ask for clarification" → `POST /cases/:caseId/draft-clarification` with body: `{ clarificationText: "Could you provide your Stripe subscription ID or the email address used for billing? This will let us look up the exact pro-rata calculation." }` | Case → `awaiting-user`, email sent to raj.patel@buildfast.io |
| 3. Customer reply | Raj replies with his subscription ID: `sub_1OxKMJ2eZvKYlo2C8Z1cNQWp` | New inbound signal on same thread |
| 4. Signal received | `POST /cases/:caseId/signal-received` triggered by incoming email | Case → `enriching` (re-triage with new context) |
| 5. Enriched triage | Triage re-runs with Raj's subscription ID in signal context | KB can now match against billing records; reply draft includes specific context |
| 6. Lead resolution | Lead reviews updated draft with subscription context → sends reply | Case resolves after refund is confirmed |

**Evaluation checkpoints:**
- Does `POST /draft-clarification` correctly transition the case from `awaiting-lead` to `awaiting-user`?
- Is the clarification email sent to Raj with the specified text?
- Does Raj's reply trigger the `signal-received` endpoint automatically (via email inbound)?
- Does the case correctly re-enter `enriching` (not create a new case)?
- Is the subscription ID visible in the updated case context for the next AI triage pass?
- If the reply is lost or delayed: does the `awaiting-user` state have an SLA timeout?

**Expected outcome:** Raj provides his subscription ID. Case re-triages with full context. Lead can now give a specific, accurate refund confirmation. Complete `awaiting-lead → awaiting-user → enriching → awaiting-lead → resolved` cycle executed.

---

### NF-05 · "Operator Closes Out-of-Scope Signal" · Email · Low Priority (no triage needed)

**Persona:** The Operator managing DocuGardener's support queue. A recruiter has sent an email to support@docugardener.io asking if DocuGardener is hiring engineers. Completely out of scope.

**Trigger:**
Inbound email:
```
From: recruiter@staffingagency.com
To: support@docugardener.io
Subject: Engineering positions at DocuGardener?

Hi,

I'm a technical recruiter and noticed DocuGardener is growing quickly.
Are you looking for senior backend engineers? I have strong candidates.

Best,
Katie
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Signal ingestion | Email → case created, `status: new` → `enriching` → triage | |
| 2. Triage | Severity: **low**, type: **user_request**, labels: `recruiting`, `out-of-scope` | AI should correctly identify this as not a support request |
| 3. Routing | → `awaiting-lead` (no auto-reply, no known issue match) | |
| 4. Operator action | Operator opens case, recognizes it as out-of-scope spam | |
| 5. Close case | Operator clicks "Close" → `awaiting-lead` → `closed` | No reply sent to Katie; `closed` is terminal |
| 6. No notification | No escalation, no CR, no audit event for wrong routing | Audit event for manual close is created |
| 7. Queue cleanup | Case no longer appears in active queue | `closed` cases filtered out by default |

**Evaluation checkpoints:**
- Can an operator close a case from `awaiting-lead` directly (bypassing all other states)?
- Is `closed` correctly treated as a terminal state (no further transitions)?
- Is the closed case removed from the default queue view but still accessible in "All" / archived view?
- Is a `case.closed` audit event created with the actor (who closed it)?
- Does NestFleet correctly NOT send any auto-reply to a recruiter email?

**Expected outcome:** Queue stays clean. Out-of-scope signal closed in < 30 seconds operator time. No customer communication sent.

---

### NF-06 · "Duplicate Signal — Same Customer Reports Same Issue Twice" · Email · High Severity

> Tests NestFleet's deduplication behavior. No deduplication is guaranteed — this scenario validates what the operator sees and whether the queue is manageable.

**Persona:** Amara from SS-01 (credential not appearing in vault). She sends her original email, then 3 minutes later sends an identical email from the same address because she didn't receive a confirmation.

**Trigger:**
Two emails arrive from `amara.diallo@gmail.com` within 3 minutes, with the same subject and near-identical body.

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. First signal | SS-01 email → case created (case A), `status: awaiting-lead` | Normal flow |
| 2. Second signal | Near-identical email arrives 3 minutes later | Does NestFleet detect duplicate? |
| 3. Deduplication check | **Option A:** System detects same sender + similar content → links second signal to case A (no new case) | V4 context completeness |
| 4. No dedup | **Option B (current expected):** Second signal creates a new independent case B | Operator sees two `amara.diallo@gmail.com` cases in queue |
| 5. Operator discovery | Operator notices two cases from same sender, same subject in queue | Queue must make duplicates discoverable |
| 6. Merge or close | Operator closes case B as duplicate with note: "Duplicate of case A (amara SS-01)" | `closed` terminal state used for dedup resolution |
| 7. Audit trail | Case B closed with rationale visible | |

**Evaluation checkpoints:**
- Does NestFleet currently create two separate cases (expected behavior, not a bug)?
- Is there any visual indicator in the queue when the same sender has multiple open cases?
- Can the operator close a duplicate case quickly (< 3 clicks)?
- After close, does case B disappear from the active queue?
- **Future improvement flag:** Would sender-level dedup (hold second signal if first case open from same sender) improve operator experience? Record as product feedback.

**Expected outcome:** Operator identifies and closes the duplicate within 1 minute. No double-reply sent to Amara. Queue stays manageable even without automatic deduplication.

---

### NF-07 · "Knowledge Lead Rejects an AI-Extracted FAQ Entry" · Console (Knowledge Tab) · Internal

> **Prerequisite:** DG-09 must be completed. The `knowledge_capture` agent has extracted an FAQ entry from the DG-03 resolution and it is awaiting review in the Knowledge tab.

**Persona:** Knowledge Lead reviewing the extracted FAQ. The AI extracted the rollup config answer but the proposed question is misleading: "How do I disable nightly issues?" — the correct framing is "How do I reduce issue noise from nightly rollup?".

**Trigger:**
Knowledge Lead opens `Console → Knowledge → Assets` tab, sees pending review badge.

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Assets tab | Console → Knowledge → Assets shows extracted FAQ with `pending_review` badge | Entry lists question, answer, source case reference |
| 2. Content review | Knowledge Lead reads the extracted entry: sees misleading question framing | Full proposed Q+A visible with source attribution |
| 3. Reject action | Knowledge Lead clicks Reject → provides reason: "Question framing is misleading — implies disabling issues rather than tuning rollup config" | Rejection requires rationale |
| 4. State transition | Knowledge asset → `rejected` | Asset removed from pending queue |
| 5. Audit trail | Rejection reason preserved in asset history | Future review possible if framing is corrected |
| 6. No KB pollution | Rejected entry does NOT appear in vector search results | Triage agent cannot retrieve rejected assets |

**Evaluation checkpoints:**
- Does the Knowledge Assets tab display pending-review entries with source case attribution?
- Is the extracted Q+A readable and editable before rejection?
- Can the Knowledge Lead reject an entry (not just approve)?
- After rejection, is the asset correctly excluded from vector search?
- Is the rejection reason persisted for audit purposes?
- **Future path:** Can the Knowledge Lead edit and re-submit (fix the question framing and approve)? Or only reject and let the capture agent re-try?

**Expected outcome:** Bad extraction rejected cleanly. KB stays accurate. No misleading FAQ retrieved by the triage agent for future DocuGardener rollup questions.

---

### NF-08 · "Lead Manually Overrides Triage Severity" · Console (Case Detail) · Any Severity

> Tests the `POST /cases/:caseId/triage-manual` endpoint. Validates that a Lead can upgrade/downgrade severity after AI triage and that the audit trail records the manual override.

**Persona:** Support Lead reviewing a new SkillSeal case. The AI triaged it as `normal` severity — a recruiter asking about batch API limits. The Lead notices the recruiter mentioned "we have 500 candidates to verify before Friday for a Series B fundraise." The AI missed the deadline signal. The Lead wants to upgrade to `high`.

**Trigger:**
Lead opens the case from the `awaiting-lead` queue, reads the full signal, decides to override severity.

**Inbound signal (example):**
```
From: ops@capitalventures.io
To: support@skillseal.io
Subject: Question about batch verification API capacity

Hi,

We need to verify approximately 500 candidates before Friday for a Series B
fundraise due diligence process. What's the max batch size your API supports,
and what are the rate limits? We're currently getting 429s.

Capital Ventures Operations Team
```

**Expected NestFleet flow:**

| Step | What should happen | Evaluate |
|------|-------------------|----------|
| 1. Initial triage | AI assigns `severity: normal` (generic capacity question) | Labels: `batch-api`, `rate-limit` |
| 2. Case in queue | Case lands in `awaiting-lead` | Lead reads full context |
| 3. Severity override | Lead clicks "Override Severity" → selects `high` → adds note: "Friday fundraise deadline — Series B due diligence" | `POST /cases/:caseId/triage-manual` with `{ severity: "high", manual_note: "..." }` |
| 4. Case update | Case severity updated to `high` | Visible in case detail and queue badge |
| 5. Audit event | `case.triage_manual` audit event with actor, old severity, new severity, and note | Audit trail shows who changed severity and why |
| 6. Notification | Lead queue re-sorts (high cases surface above normal) | Urgency reflected in queue ordering |
| 7. Reply handling | Lead escalates or sends priority reply with batch API limits (from KB) | |

**Evaluation checkpoints:**
- Does `POST /cases/:caseId/triage-manual` accept severity and manual_note fields?
- Is the updated severity immediately reflected in the case detail and queue view?
- Is the audit event created with the Lead's identity, the old severity, the new severity, and the note?
- Can severity be both upgraded (normal → high) and downgraded (critical → high)?
- Does the queue re-sort to reflect the new severity?
- Is the manual override visually distinguishable from AI-assigned severity in the case view?

**Expected outcome:** Capital Ventures receives a high-priority reply with batch limits and rate-limit workaround within minutes. Manual override preserved in audit trail. Lead can explain to any future reviewer why severity was changed.

---

## Extended Scenarios — Coverage Matrix

| ID | Actor | State transition exercised | API endpoint | Gap it closes |
|----|-------|--------------------------|--------------|---------------|
| NF-01 | Change Lead | `approval-pending` → `approved` (sidecar cr_track=infra_debt) | `POST /change-requests/:crId/approve` | Infra-debt CR review; cr_track badge in UI |
| NF-02 | Change Lead | `approval-pending` → `rejected` (terminal) | `POST /change-requests/:crId/reject` | CR rejection path — completely untested |
| NF-03 | Customer + Operator | `resolved` → `awaiting-user` (re-open via new inbound signal) | Email inbound | Case re-open lifecycle |
| NF-04 | Lead + Customer | `awaiting-lead` → `awaiting-user` → `enriching` → `awaiting-lead` | `POST /draft-clarification`, `POST /signal-received` | Full clarification round-trip |
| NF-05 | Operator | `awaiting-lead` → `closed` (spam/out-of-scope) | Case update | `closed` as manual terminal from awaiting-lead |
| NF-06 | Customer + Operator | Duplicate case close `awaiting-lead` → `closed` | Case close | Dedup discovery and cleanup workflow |
| NF-07 | Knowledge Lead | Knowledge asset `pending_review` → `rejected` | `POST /knowledge-assets/:id/reject` | Knowledge rejection path; KB accuracy guard |
| NF-08 | Support Lead | Manual severity override on `awaiting-lead` case | `POST /cases/:caseId/triage-manual` | Manual triage override + audit trail |
