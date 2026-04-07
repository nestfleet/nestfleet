# NestFleet Autonomy and Approval Policy

## 1. Purpose

This document defines how NestFleet decides what may run automatically, what requires human approval, and what must be forbidden in v1. It converts the product's deterministic automation requirements into an execution policy.

## 2. Scope Assumptions

- v1 is `DocuGardener` first
- v1 is `internal-operator first`
- v1 ends at `approved PR draft`
- legal and security baselines in `docs/legal-compliance-eu-germany.md` apply by default

## 3. Policy Principles

- the platform owns state, not the model
- every consequential action must be a typed proposal
- every proposal must be grounded in evidence
- every state change must pass policy checks
- every role gets least-privilege tool access
- when evidence is weak or policy is unclear, NestFleet must abstain and escalate

## 4. Action Tier Model

| Tier | Description | Default handling |
| --- | --- | --- |
| `T0` | Read-only internal tasks such as summarize, classify, dedupe, retrieve | automatic |
| `T1` | Low-risk user-facing routine communication under approved policy | automatic only when validation passes |
| `T2` | Record-mutating internal actions such as case updates, problem creation, or change draft creation | automatic with validation and audit |
| `T3` | Engineering artifact creation such as GitHub issues, branches, or PR drafts | approval-gated or pre-approved by policy |
| `T4` | Human commitments or materially consequential actions | human approval required |
| `T5` | Prohibited actions in v1 | never automatic |

## 5. Persona Permission Baseline

| Persona | Allowed automatic actions | Approval-gated actions | Forbidden actions |
| --- | --- | --- | --- |
| Frontline | signal normalization, clarification questions, case creation, routine answer drafts, reminder notifications | direct user replies that contain commitments or sensitive guidance | compensation, legal commitments, outage declarations, root-cause claims presented as fact |
| Steward | triage, severity proposal, known-issue matching, problem creation, change draft creation, approval package creation | high-impact severity changes, problem confirmation with strategic impact | silent closure of ambiguous critical cases, self-approval of risky actions |
| Change | engineering context prep, GitHub issue sync, implementation outline, PR draft generation after approval | repo-writing actions where policy requires lead confirmation | merge, deploy, credential changes, production operations |

## 6. Deterministic Validation Envelope

Every action in `T1` through `T4` must satisfy all of the following:

- proposal uses a typed schema
- proposal includes evidence refs
- schema validation passes
- policy engine returns `allow` or `require_approval`
- validator layer returns `pass`
- audit event is written before execution

If any condition fails, the action must become `abstain` or `awaiting-lead`.

## 7. Evidence Requirements by Action Type

### 7.1 User-Facing Routine Reply

Minimum evidence:

- conversation summary
- product memory pack from approved sources
- either two supporting evidence refs or one approved runbook or FAQ marked authoritative

### 7.2 Severity or Outage Classification

Minimum evidence:

- user report or system signal
- known-issue or incident match result
- severity rationale bound to explicit policy rules

### 7.3 Change Request Creation

Minimum evidence:

- problem statement or bug summary
- affected area
- linked case or problem refs
- GitHub target or explicit reason it does not yet exist

### 7.4 PR Draft Creation

Minimum evidence:

- approved change request
- repository target
- implementation context
- validation summary
- available repo checks, if any

## 8. Default Thresholds

These thresholds are not a substitute for policy, but they make the automation envelope explicit.

### 8.1 Automatic User Reply Threshold

Allow auto-send only when:

- case type is `user_request`
- severity is `normal` or `low`
- confidence is `0.85` or higher
- retrieval uses only approved source tiers
- validator pass is recorded
- reply contains no custom promise, compensation, or unsupported root-cause claim

Otherwise:

- draft only, then route to Support Lead or operator

### 8.2 Automatic Change Draft Threshold

Allow auto-creation of a `draft` change request when:

- case type is `bug_report`, `outage_report`, or repeated `user_feedback`
- confidence is `0.75` or higher
- evidence pack is complete
- policy does not flag the issue as legally or operationally sensitive

Otherwise:

- route to Product Lead or Change Lead

### 8.3 PR Draft Threshold

Allow PR draft creation only when:

- linked change request is already `approved`
- repository permissions are allowed by policy
- validator pass is recorded
- no secrets, credentials, or production-only context are included
- the repo target is within the approved product boundary

## 9. Approval Routing

| Action | Required approver |
| --- | --- |
| high-impact user communication | Support Lead |
| product-behavior or roadmap tradeoff | Product Lead |
| change request approval | Change Lead |
| docs or runbook publication as official guidance | Knowledge Lead |
| employment, HR, legal, financial, or security-sensitive decision | human specialist outside normal automation path |

## 10. Approval Package Requirements

Every approval request should contain:

- target entity and requested action
- concise rationale
- risk level
- evidence refs
- policy outcome
- expected user impact
- rollback or fallback note where applicable

## 11. Forbidden Actions in v1

- merge or deploy code
- modify production systems directly
- create or change credentials, secrets, or access rights
- make compensation, refund, legal, or contractual commitments automatically
- terminate accounts or impose sanctions automatically
- operate in HR, worker-monitoring, credit, insurance, public-service, or law-enforcement workflows
- use customer content for cross-customer training by default

## 12. Abstain and Escalate Rules

NestFleet must abstain when:

- evidence sources conflict materially
- retrieval returns low-trust or stale context only
- the case spans more than one product boundary
- severity may be `critical` but facts are incomplete
- the action touches regulated or prohibited domains
- the validator and proposer disagree

Escalation target should be:

- Support Lead for communication ambiguity
- Product Lead for prioritization or behavior ambiguity
- Change Lead for implementation ambiguity
- operator plus all relevant leads for `critical` outage conditions

## 13. Rollout Gates

Before any new automation path is enabled in production:

- run it in review-only or shadow mode
- test it against an evaluation set
- define pass thresholds
- define explicit kill switch and rollback behavior
- log disagreement and abstain rates for the path

## 14. Governed Learning Policy

Advanced roles may improve only through a reviewed promotion path.

Allowed:

- collecting outcomes from accepted and rejected work
- generating candidate improvements to role instructions, retrieval preferences, and task heuristics
- offline evaluation and shadow testing
- human-reviewed promotion of versioned role profiles

Forbidden:

- live self-editing of policy rules
- live expansion of tool permissions
- unreviewed replacement of an active role profile
- training on customer content outside approved legal and product boundaries

## 15. Day-One Policy Set for MVP

Start with only these automatic paths enabled:

- intake summarization
- duplicate and known-issue suggestion
- clarifying questions
- low-risk user-request answers
- case updates and reminders
- change draft creation

Keep these approval-gated from day one:

- high-impact user communication
- outage routing
- change approval
- GitHub PR draft creation if repo write access is sensitive

## 16. Operator RBAC Model (Implemented 2026-03-19)

### 16.0 Design Rationale and Real-World Mapping

NestFleet's RBAC model is built on five atomic responsibility domains drawn from real-world support operations, plus one cross-cutting administration domain. Each role maps to a distinct phase of the case lifecycle.

#### Responsibility Domains

| Domain | NestFleet Role | Real-World Equivalent | Core Question |
| --- | --- | --- | --- |
| Respond | `operator` | L1 support agent | "What does the user need? Can I resolve this now?" |
| Diagnose | `support_lead` | L2 support engineer | "What is actually broken? How severe? Is this known?" |
| Change | `change_lead` | Engineering lead | "Is this change safe? Does the PR look correct?" |
| Prioritize | `product_lead` | Product manager | "Should we do this? What is the impact vs cost?" |
| Curate | `knowledge_lead` | Knowledge manager | "Is our knowledge base accurate and complete?" |
| Administer | `admin` | System administrator | "Is the platform itself configured and healthy?" |

#### Lifecycle Ownership per Role

Each role owns a distinct phase. No two roles overlap in their primary responsibility.

| Role | Lifecycle Steps Owned |
| --- | --- |
| `operator` | Receive signal, ask clarifications, resolve known issues, escalate unknowns |
| `support_lead` | Triage, classify type and severity, match known issues, create CRs, resolve cases |
| `change_lead` | Review CRs, approve or reject, review PR drafts, complete CRs |
| `product_lead` | Approve high-impact CRs, triage escalations, set severity overrides |
| `knowledge_lead` | Manage memory sources, review retrieval quality, flag conflicts |
| `admin` | Users, settings, license, integrations, full platform management |

#### Intentional Overlap Zones (Handoffs)

Some steps allow multiple roles by design. These are handoff points where more than one person can trigger the next step:

- Triage: `support_lead` + `product_lead` (product lead can override triage for strategic reasons)
- CR Approval: `change_lead` + `product_lead` (either can approve; product lead for business, change lead for technical)
- Draft clarification: `operator` + `support_lead` (L1 can draft, L2 can refine)
- Send to change: `support_lead` + `change_lead` + `product_lead` (any of the three can decide a case needs engineering work)

#### Granularity Decision: Feature-Level vs Record-Level

v1 implements feature-level RBAC (can this role access this function?). Record-level RBAC (can this user only see their own cases?) is not needed for v1 because:

1. Team size: v1 targets small teams (1 to 5 people per product). Everyone sees everything; RBAC prevents accidental actions, not accidental visibility.
2. Single product: v1 has one product per installation. Record-level isolation only matters with multiple teams on one instance.
3. Audit trail: Even if an operator can view a case they did not create, they cannot resolve it (backend guard). The audit trail shows who did what.
4. Role combination: A solo founder is `admin`. A small team has 2 to 3 people each holding multiple roles. This is cleaner than building record-level ownership.

Record-level RBAC becomes needed when any of these triggers arrive: multi-team on one instance, external customer portal, SOC 2 or ISO 27001 compliance audit, or 10+ operators per product. The current schema already stores the keys needed for this (case `current_persona`, CR `created_by` and `approved_by`), so the upgrade path is an additive `requireOwnership()` middleware without restructuring.

#### Role Set Optimization

All six roles are justified as atomic units. In practice, small teams combine them:

| Team Size | Typical Assignment |
| --- | --- |
| Solo founder | `admin` (gets everything via superuser bypass) |
| 2-person team | `admin` + `operator` (admin also handles all lead functions) |
| 3 to 5 person team | `admin` + `operator` + `support_lead` + combined `change_lead` and `product_lead` |
| 10+ person team | All 6 roles assigned to distinct people |

Multi-role assignment (e.g. `["support_lead", "change_lead"]`) is the composition mechanism. The atomic definitions stay clean, and any role combination that makes sense for a team can be configured without code changes.

### 16.1 Role Definitions

| Role | Description |
| --- | --- |
| `admin` | Full system access. Manages users, license, settings, and all operational functions. |
| `operator` | Day-to-day console user. Views cases, PR drafts, notifications. Read-only settings access. |
| `support_lead` | Owns case lifecycle. Can patch, resolve, triage, and draft clarifications on cases. |
| `change_lead` | Owns change requests. Can approve/reject CRs and complete PR drafts. |
| `product_lead` | Product-level oversight. Can approve/reject CRs and triage cases. |
| `knowledge_lead` | Manages product memory. Read-only access to cases and notifications. |

### 16.2 Console Sidebar Navigation Access

| Nav Item | admin | operator | support_lead | change_lead | product_lead | knowledge_lead |
| --- | --- | --- | --- | --- | --- | --- |
| Cases | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Queue (Approvals) | ✅ | — | — | ✅ | ✅ | — |
| Approvals | ✅ | — | — | ✅ | ✅ | — |
| PR Drafts | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ (read) | — | — | — | — |

### 16.3 Backend API Endpoint Guards

Each endpoint is protected by `requireAuth()` (JWT validation) plus `requireRole()` where applicable. `admin` always passes all role checks.

| Endpoint | Method | Allowed Roles |
| --- | --- | --- |
| `/products/:id/cases` | GET | any authenticated user |
| `/products/:id/cases/:caseId` | GET | any authenticated user |
| `/products/:id/cases/:caseId` | PATCH | admin, support_lead |
| `/products/:id/cases/:caseId/resolve` | POST | admin, support_lead |
| `/products/:id/cases/:caseId/triage-manual` | POST | admin, support_lead, product_lead |
| `/products/:id/cases/:caseId/draft-clarification` | POST | admin, operator, support_lead |
| `/products/:id/cases/:caseId/send-to-change` | POST | admin, support_lead, change_lead, product_lead |
| `/products/:id/cases/:caseId/forward-to-team` | POST | admin, support_lead, product_lead |
| `/products/:id/cases/:caseId/conversation` | GET | any authenticated user |
| `/products/:id/cases/:caseId/signal-received` | POST | any authenticated user |
| `/products/:id/pending-approvals` | GET | admin, change_lead, product_lead |
| `/products/:id/pending-approvals/:crId/approve` | POST | admin, change_lead, product_lead |
| `/products/:id/pending-approvals/:crId/reject` | POST | admin, change_lead, product_lead |
| `/products/:id/change-requests` | GET | any authenticated user |
| `/products/:id/change-requests/:crId/complete` | POST | admin, change_lead |
| `/products/:id/notifications` | GET | any authenticated user |
| `/products/:id/notifications/:id/ack` | POST | any authenticated user |
| `/products/:id/settings` | GET | admin, operator |
| `/products/:id/settings` | PUT | admin |
| `/products/:id/settings/test-llm` | POST | admin |
| `/products/:id/settings/list-models` | POST | admin |
| `/products/:id/memory/sources` | GET | admin, operator, knowledge_lead |
| `/products/:id/memory/stats` | GET | admin, operator, knowledge_lead |
| `/products/:id/memory/search` | POST | admin, operator, knowledge_lead |
| `/products/:id/memory/health` | GET | admin, operator, knowledge_lead |
| `/products/:id/memory/sources/*` | DELETE | admin |
| `/users/*` | ALL | admin |
| `/license/status` | GET | admin |
| `/license/refresh` | POST | admin |

### 16.4 Frontend Action Button Visibility

Action buttons are conditionally rendered based on the user's roles. The backend enforces the same rules — the frontend is a convenience, not a security boundary.

| UI Action | Visible To | Notes |
| --- | --- | --- |
| Route to Eng button (Lead queue) | admin, support_lead, change_lead, product_lead | Primary action for engineering-routable cases |
| Forward to Team button (Lead queue) | admin, support_lead, product_lead | Primary action for `sales_inquiry` / `billing_inquiry` categories; always available as alternate action |
| Resolve directly button (Lead queue) | admin, support_lead, product_lead | Primary action for `user_feedback`, CR-rejected, and **Pending Handoff** cases; always available as alternate action |
| Pending Handoff section (Lead queue) | admin, support_lead, change_lead, product_lead | `in-resolution` cases with `last_event_action=case.forwarded_to_team`; surfaced automatically via second SWR query |
| Pending Handoff filter pill (Cases list) | all authenticated | Appears when `pendingHandoffCount > 0`; client-side filter only |
| Approve / Reject buttons (Approvals queue) | admin, change_lead, product_lead | |
| Accept & Complete button (PR Draft detail) | admin, change_lead | |
| Save buttons (Settings edit) | admin | |
| Users tab (Settings) | admin | |
| License & Support tab (Settings) | admin | |

### 16.5 Implementation Details

- Backend: `requireRole(...roles)` middleware in `src/auth/middleware.ts` — admin bypass built in
- Frontend: `canAccessNav()` and `canPerformAction()` in `console/src/lib/permissions.ts`
- Sidebar filtering: `Sidebar.tsx` reads `useAuth().user.roles` and filters `NAV_ITEMS`
- Settings tabs: `SECTIONS` array has `adminOnly` flag; filtered by `isAdmin` in `SettingsPage`

### 16.6 Test Accounts

Test accounts are seeded via `scripts/seed-test-users.ts`. Password is defined in the seed script (not committed to documentation per CG-07).

| Email | Roles |
| --- | --- |
| admin@nestfleet.local | admin |
| operator@nestfleet.local | operator |
| support@nestfleet.local | support_lead |
| change@nestfleet.local | change_lead |
| product@nestfleet.local | product_lead |
| knowledge@nestfleet.local | knowledge_lead |
| multi@nestfleet.local | support_lead, change_lead |

Run: `npx tsx --env-file .env scripts/seed-test-users.ts`

## 17. Policy Review Cadence

- weekly review during pilot
- monthly review once the automation paths stabilize
- immediate review after any material false positive, unsupported claim, or policy breach
