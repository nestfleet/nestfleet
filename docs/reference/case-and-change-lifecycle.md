# NestFleet Case and Change Lifecycle

## 1. Purpose

This document turns the NestFleet vision into explicit lifecycle rules for v1. It defines how a case moves from first signal to either direct resolution or approved PR draft, and how a change request moves from draft to completed review package.

## 2. Scope Assumptions

- first live product is `DocuGardener`
- second product is `SkillSeal`
- v1 channels are `email` and `Telegram`
- v1 posture is `internal-operator first`
- GitHub is the mandatory engineering backbone
- v1 stops at `approved PR draft`

## 3. Lifecycle Goals

- keep the user thread coherent from first contact to outcome
- preserve evidence, validation, and auditability at every state transition
- separate direct resolution from product-change work
- escalate quickly when confidence, policy, or risk conditions are not met
- keep the path from repeated issue to change request deterministic

## 4. Initial Case Taxonomy

### 4.1 Supported Case Types

- `user_request`
- `bug_report`
- `outage_report`
- `user_feedback`
- `sales_inquiry` — enterprise or commercial prospect inquiry requiring human sales team involvement; no automated resolution path

### 4.2 Severity Model

- `critical`: active outage, major product unavailability, or severe user-impacting failure
- `high`: significant degradation, blocked core workflow, or repeated bug with immediate product risk
- `normal`: routine bug report, support request, or actionable feedback
- `low`: low-impact feedback, docs gap, or non-urgent product question

**Severity floor for enterprise sales inquiries:** a `sales_inquiry` case that carries enterprise-tier signals in its triage labels (`enterprise`, `soc2`, `on-premise`, `sso`, `compliance`, `hipaa`, `gdpr`, `sla`) is raised to a minimum of `normal` regardless of the LLM severity output. LLMs score sales inquiries as `low` (no user pain) but a prospect with compliance requirements and a near-term decision timeline has material revenue impact. See §11.6 for the full override rule.

## 5. Case Lifecycle

### 5.1 State Model

| State | Primary owner | Entry condition | Allowed exits | Required controls |
| --- | --- | --- | --- | --- |
| `new` | Frontline | Signal created or linked to a new case | `enriching`, `closed` | Signal capture, product routing, audit event |
| `enriching` | Frontline | Case needs identity, context, dedupe, or clarification | `triaged`, `awaiting-user`, `closed` | Evidence pack start, classification draft, validation record for outbound clarification |
| `triaged` | Steward | Minimum context exists for type, severity, urgency, and next-step decision | `in-resolution`, `awaiting-lead`, `in-change`, `resolved` | Severity evidence, known-issue check, policy check |
| `awaiting-user` | Frontline | More user input is required before safe progress is possible | `enriching`, `resolved`, `closed` | Reminder schedule, notification policy, user-facing validation |
| `awaiting-lead` | Steward | Human judgment or approval is required | `in-resolution`, `in-change`, `resolved`, `closed` | Approval request, notification, audit trail. Lead actions: Route to Eng (`→ in-change`), Forward to Team (`→ in-resolution`), Resolve directly (`→ resolved`). |
| `in-resolution` | Frontline or Steward | Safe direct resolution path exists | `resolved`, `awaiting-user`, `awaiting-lead`, `in-change` | Evidence-backed response, validation record, policy check |
| `in-change` | Change | Product or operational change is required | `pr-drafting`, `awaiting-lead`, `resolved`, `closed` | Change request link, GitHub issue link, approval package |
| `pr-drafting` | Change | Approved change request can move into engineering preparation | `resolved`, `awaiting-lead`, `closed` | Repository policy check, validation record, PR draft artifact |
| `resolved` | Support Lead or terminal persona under policy | Direct answer, approved action, or PR draft outcome is accepted for v1 | `closed`, `awaiting-user` | Resolution summary, user follow-up policy, knowledge capture check |
| `closed` | System or lead | Case is complete or inactive according to policy | none | Final audit event, retention clock, reopen path retained |

### 5.2 Case Transition Rules

- `new -> enriching` happens automatically after signal normalization.
- `enriching -> awaiting-user` is allowed only when missing information blocks safe triage.
- `enriching -> triaged` requires case type, severity hint, reporter identity or channel identity, and duplicate check result.
- `triaged -> in-resolution` is allowed only for low-risk paths covered by policy.
- `triaged -> awaiting-lead` is required when the case includes ambiguous risk, high user impact, or any human commitment.
- `triaged -> in-change` is allowed only when the Steward determines that product or operational change is necessary and a change request draft exists.
- `in-change -> pr-drafting` requires approved change request status.
- `pr-drafting -> resolved` requires PR draft creation or an explicit decision to stop at prepared implementation context.
- `resolved -> closed` should happen automatically after the configured cooling-off period or immediately when the operator closes it.

### 5.3 Case Closure Defaults

- `user_request` cases may auto-close after `7 calendar days` of inactivity after a validated response.
- `bug_report` and `outage_report` cases should not auto-close without either operator review or explicit user resolution signal.
- `user_feedback` cases may close after routing and acknowledgement, but the linked problem or backlog item must remain open if action is still pending.

## 6. Change Request Lifecycle

### 6.1 State Model

| State | Primary owner | Entry condition | Allowed exits | Required controls |
| --- | --- | --- | --- | --- |
| `draft` | Steward or Change | Case or problem indicates change may be required | `analysis`, `rejected` | Origin link, rationale, initial risk level |
| `analysis` | Change | Change candidate needs engineering and product framing | `approval-pending`, `rejected` | GitHub issue link, proposed scope, evidence pack |
| `approval-pending` | Change Lead or Product Lead | Approval package is ready | `approved`, `rejected` | Approval request, notification, audit event |
| `approved` | Change | Required lead approval has been granted | `implementation-prep`, `rejected` | Approval record, policy check |
| `implementation-prep` | Change | NestFleet is preparing implementation plan and repo context | `pr-drafted`, `rejected` | Repository access check, validation record, branch strategy |
| `pr-drafted` | Change | PR draft or patch package exists | `completed`, `pr-merged` (v1.1), `rejected` | PR draft link, diff summary, validation summary |
| `pr-merged` | System (v1.1) | GitHub PR has been merged (webhook) | `ci-pending`, `completed` | Merge commit SHA, merge timestamp |
| `ci-pending` | System (v1.1) | Waiting for CI check suite result | `ci-passed`, `ci-failed` | Check suite ID, branch |
| `ci-passed` | System (v1.1) | CI check suite completed successfully | `completed` | CI conclusion, details URL |
| `ci-failed` | System (v1.1) | CI check suite failed after merge | `pr-merged` (retry), `rejected` | Failure details, notification to Change Lead |
| `completed` | Change Lead or operator | v1 edge has been reached successfully | none | Final review note, notification, knowledge update trigger |
| `rejected` | Lead | Change will not proceed in current form | none | Decision rationale, linked case update |

### 6.2 Change Routing Rules

- `draft -> analysis` is automatic once the Steward produces a sufficient problem statement.
- `analysis -> approval-pending` requires repository target, impact summary, risk summary, and recommended approver.
- `approval-pending -> approved` requires human lead approval.
- `approved -> implementation-prep` may proceed automatically if repository permissions and policy checks pass.
- `implementation-prep -> pr-drafted` requires repository validation plus successful artifact generation.
- `pr-drafted -> completed` marks the v1 terminal point (without CI tracking).
- `pr-drafted -> pr-merged` (v1.1): triggered by `pull_request.merged` webhook when CI tracking is enabled.
- `pr-merged -> ci-pending` (v1.1): automatic, immediate — waits for `check_suite.completed` webhook.
- `ci-pending -> ci-passed` (v1.1): triggered by `check_suite.completed` with `conclusion=success`. If `auto_complete_on_ci_pass=true`, CR auto-advances to `completed`.
- `ci-pending -> ci-failed` (v1.1): triggered by `check_suite.completed` with `conclusion=failure`. Emits high-priority notification to Change Lead. CR stays in `ci-failed` until lead manually retries (→ `pr-merged`) or rejects.

## 7. Canonical Flows by Issue Class

### 7.1 User Request

Expected path:

`new -> enriching -> triaged -> in-resolution -> resolved -> closed`

Automation target:

- highest automation priority
- may receive direct grounded answer if the retrieval and validation thresholds pass

Lead involvement:

- Support Lead only when ambiguity, policy concern, or user sensitivity exists

### 7.2 Bug Report

Two paths depending on known-issue match result:

**Path A — no known-issue match (engineering change required)**

`new -> enriching -> triaged -> in-change -> pr-drafting -> resolved`

Automation target:

- automate intake, dedupe, evidence gathering, GitHub issue prep, and PR draft preparation
- do not auto-close from AI judgment alone

Lead involvement:

- Change Lead approval before PR drafting

**Path B — known-issue match with infra/performance signals (auto-resolve + side-car CR)**

Case path: `new -> enriching -> triaged -> in-resolution -> resolved`

Parallel CR path: `draft [infra_debt] -> analysis -> approval-pending -> approved -> implementation-prep -> pr-drafted`

The case resolves when the workaround answer is delivered to the user. The infra-debt CR runs independently on the engineering team's timeline. **Case `resolved` status before CR approval is expected and correct** — the user's immediate problem is solved; the CR tracks the underlying debt, not the user outcome.

Trigger predicate: `case_type === "bug_report"` AND `triage_output.labels` intersects `{ performance, scaling, infrastructure, timeout, worker, capacity, memory, latency, queue, throughput }`.

CR is created with `cr_track: "infra_debt"` and is visually differentiated in the Change Approvals queue with an orange **Infra Debt** badge.

Lead involvement:

- Change Lead receives notification when CR reaches `approval-pending` (same as primary path)
- Support Lead is done when the case resolves — no further action required on the case

### 7.3 Outage Report

Expected path:

`new -> enriching -> triaged -> awaiting-lead or in-change`

Automation target:

- automate acknowledgement, severity routing, operator notification, and evidence collection
- do not automate final incident declarations or recovery claims

Lead involvement:

- immediate Support Lead or Product Lead visibility for `critical`
- Change Lead if engineering action is required

### 7.4 User Feedback

Expected path:

`new -> enriching -> triaged -> in-resolution or awaiting-lead or in-change`

Automation target:

- automate summarization, clustering, duplicate linking, and backlog suggestion
- do not over-automate closure of strategically important feedback

Lead involvement:

- Product Lead when roadmap or behavior tradeoffs are involved

### 7.5 Sales Inquiry

Expected path:

`new -> enriching -> triaged -> awaiting-lead -> in-resolution -> resolved`

Automation target:

- automate intake, triage, label extraction, and severity scoring
- do NOT auto-resolve — no automated reply is appropriate for a commercial inquiry
- triage correctly routes to `awaiting-lead` immediately (category `sales_inquiry` triggers direct escalation in `StewardWorker`)

Lead involvement:

- Support Lead or Product Lead reviews case in the Lead Review queue and uses **Forward to Team** action to hand off to the sales team with full context
- Lead records forwarding note in the `case.forwarded_to_team` audit event (team, context, owner)
- After forwarding, the case moves to `in-resolution` and appears in the Lead Review queue under the **Pending Handoff** section — the Lead retains ownership and can see it without searching the full Cases list
- Lead resolves the case after confirming the handoff outcome with the external team

Severity calibration:

- enterprise signals in labels raise severity floor to `normal` (see §4.2 and §11.6)
- allows correct SLA classification and prioritization in the Lead queue

## 8. SLA and Timeout Baseline

### 8.1 Case Handling

- `critical` cases should trigger immediate operator notification and acknowledgement within `10 minutes`
- `high` cases should be triaged within `60 minutes` during business hours
- `normal` cases should be triaged within `4 business hours`
- `low` cases may be batched into queue-based review or digests

### 8.2 Waiting States

- `awaiting-user` should remind after `24 hours` and `72 hours`
- unresolved `awaiting-user` cases may close after `7 calendar days` with clear reopen wording
- `awaiting-lead` should remind according to notification priority policy
- stale `analysis` or `implementation-prep` changes should raise an internal reminder after `2 business days`

## 9. Required Artifacts by Stage

### 9.1 Before `triaged`

- normalized conversation summary
- product identification
- issue-type proposal
- duplicate or known-issue result

### 9.2 Before `in-change`

- problem statement
- impact summary
- supporting evidence refs
- GitHub issue target or rationale for absence

### 9.3 Before `approval-pending`

- change summary
- risk level
- affected surfaces
- proposed approval role
- user-communication implication

### 9.4 Before `pr-drafted`

- approved change request
- repository target
- implementation notes
- validation record
- test or verification notes where available

## 10. v1 Definition of Done

### 10.1 Direct Resolution Done

- user received a validated answer or acknowledgement
- case status is `resolved`
- audit trail and validation record exist
- knowledge update check was performed

### 10.2 Change Path Done

- change request is approved or rejected with rationale
- GitHub issue is linked where required
- PR draft or patch package exists if approved
- case reflects the current terminal outcome

## 11. Implementation Controls (SA Review — 2026-03-18)

The following controls were added in response to the SA architecture review (`docs/sa-review-agentic-architecture.md`):

### 11.1 State Transition Enforcement (SLICE-14)

All case and change request state updates MUST go through `CaseStateMachine.transition()` and `ChangeRequestStateMachine.transition()` respectively. Direct `updateCase(id, { status })` calls are prohibited. The state machines enforce the allowed-exits rules defined in §5.1 and §6.1 above. Illegal transitions throw `InvalidStateTransitionError`.

### 11.2 Transactional State + Dispatch (SLICE-15)

State transitions and follow-on job dispatches MUST be atomic. When a worker updates case status and dispatches a follow-on job, both operations share a single PostgreSQL transaction. If dispatch fails, the state update rolls back. This eliminates silent stuck states.

### 11.3 Severity Vocabulary

The canonical severity vocabulary is: `critical`, `high`, `normal`, `low` (per §4.2). Agent prompts and structured output schemas MUST use these exact terms. If an LLM produces `medium`, the worker MUST map it to `normal` before any DB write.

### 11.4 Outage Escalation Routing

For `outage_report` cases:
- `critical` or `high` severity: immediate notification to ALL leads (support_lead, product_lead, change_lead).
- `normal` or `low` severity: notification to support_lead only.
- If the outage routing agent fails or abstains: escalation notification to ALL leads regardless of severity (the failure itself is an escalation trigger per ADR-029).

### 11.5 Signal Text Preservation

The original normalized signal text MUST be stored on the case record (`cases.signal_text`) at ingestion time. Workers MUST read signal text from this field, not reconstruct it from downstream artifacts (triage output, case title, etc.).

### 11.6 Triage Severity Override Rules

Post-triage override rules are applied after LLM output and before any DB write. They are pure deterministic functions — no I/O, always audited via `severityOverride` in the `case.triaged` audit event metadata.

**Rule 1 — Config/how-to downgrade cap**

- Trigger: `category` matches any of `["configuration", "how-to", "setup", "question", "feature-request"]` OR `labels` contain any of `["how-to", "configuration", "question", "feature-request", "setup"]`
- Action: if severity is `high` or `critical`, cap to `normal`
- Rationale: quantitative language ("8+ issues per night") causes LLMs to over-escalate configuration and documentation questions. Category/label signals are more reliable for this class.
- Audit tag: `config_question_cap`

**Rule 2 — Enterprise sales severity floor**

- Trigger: `category` matches any of `["sales", "sales_inquiry", "sales inquiry", "pre-sales", "presales"]` AND `labels` contain at least one of `["enterprise", "soc2", "on-premise", "on-prem", "sso", "okta", "compliance", "hipaa", "gdpr", "sla"]`
- Action: if severity is `low`, raise to `normal`
- Rationale: LLMs score sales inquiries as `low` (no user pain is evident). An enterprise prospect with compliance requirements and a near-term decision timeline represents material revenue exposure. Enterprise signals in triage labels are reliable proxies for this.
- Audit tag: `enterprise_sales_floor`

Rules are applied in order: Rule 1 fires first. If neither rule matches, severity is unchanged and `severityOverride` is omitted from the audit event.

### 11.7 Infra-Debt Side-car CR (SS-03 — 2026-03-24)

When a `bug_report` case auto-resolves via the known-issue match path (Path B above), the Steward automatically creates a parallel `draft` CR to track the underlying infrastructure debt. This CR is distinct from the primary CR created on Path A.

**Trigger:** `case_type === "bug_report"` AND `triage_output.labels` intersects the infra-signal set: `{ performance, scaling, infrastructure, timeout, worker, capacity, memory, latency, queue, throughput }`.

**Behaviour:**

- CR is created in `draft` state with `cr_track: "infra_debt"`, title prefixed `[Infra debt]`, and `impact_summary` noting it was auto-flagged.
- `change_prep` is dispatched immediately: CR advances `draft → analysis → approval-pending` automatically.
- Change Lead is notified at `approval-pending` entry (same notification path as primary CRs).
- The case transitions to `resolved` independently when the workaround answer is delivered. Case `resolved` before CR approval is expected — the lifecycles are decoupled.
- CR creation and `change_prep` dispatch are both non-fatal: failure logs a warning but does not roll back the case transition.

**CR track values:**

| `cr_track` | Origin | Approvals queue badge |
| --- | --- | --- |
| `customer_reported` | Primary path (no known-issue match) | none |
| `infra_debt` | Steward side-car (known-issue match + infra labels) | orange **Infra Debt** |

**Implementation:** `src/workers/steward-worker.ts` — `shouldCreateSidecarCr()` predicate + sidecar creation block in `in-resolution` branch. Migration `0039_cr_track.sql`.

## 12. Deferred for Later Phases

- deployment execution and deploy-status tracking (v1.2 — EPIC-15 US-15-06/07)
- auto-case-creation on deploy failure (v1.2 — EPIC-15 US-15-08)
- full CI-as-channel: pipeline health monitoring beyond NestFleet-authored PRs (v2)
- incident command features beyond basic outage routing
- multi-product concurrent routing
- outage routing queue separation (Phase 4 — SLICE-17)
- worker startup registration orchestration (Phase 4)
- cross-agent flow correlation entity / `flow_run_id` (Phase 4)
- governed learning loop design document (post-v1)
