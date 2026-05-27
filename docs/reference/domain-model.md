# NestFleet Domain Model

## 1. Purpose

This document defines the canonical domain model for NestFleet v1. It translates the product vision into concrete business objects, minimal AI personas, human lead roles, and the relationships needed to support end-to-end operational flows.

The model is intentionally opinionated:

- v1 is single-product first
- v1 channels are email and Telegram
- GitHub is the mandatory engineering and change-management backbone
- GitHub Issues and GitHub Projects are the default work-management spine
- v1 stops at approved PR draft rather than deployment execution

## 2. Modeling Principles

### 2.1 Platform Owns Truth

Agents do not own the source of truth. Durable business objects and workflow state do.

### 2.2 One Flow, Many Artifacts

A single end-to-end flow may produce several linked records: a conversation, a case, a problem, a change request, approvals, notifications, and a PR draft.

### 2.3 Explicit Human Terminal Points

Important flows should terminate in an explicit human lead role rather than an ambiguous "someone approves this" state.

### 2.4 Notifications Are Domain Objects

Notifications are not cosmetic UI output. They are operational artifacts that drive acknowledgement, escalation, and follow-through.

### 2.5 Deterministic Decision Envelopes

Any AI-assisted decision that can change state, emit communication, or create engineering artifacts should be represented as a typed, reviewable object with evidence and validation status.

### 2.6 Configurable Role Composition

The role model should be configurable per product. NestFleet should support enabling or disabling shipped role templates without changing the canonical domain model.

## 3. Primary Actors

### 3.1 AI Personas

#### Frontline Persona

Responsibilities:

- ingest inbound messages
- normalize conversations
- ask clarifying questions
- summarize and enrich cases
- keep user communication coherent

#### Steward Persona

Responsibilities:

- classify and prioritize cases
- decide whether a case is answerable, repetitive, ambiguous, or change-worthy
- create or link problems
- prepare approval packages
- coordinate low-risk resolution paths

#### Change Persona

Responsibilities:

- create change requests
- prepare engineering context
- draft implementation plans
- prepare validation notes
- draft PR-ready artifacts in GitHub

### 3.2 Human Lead Roles

#### Support Lead

Terminal owner for user-facing case handling when no product change is needed.

#### Product Lead

Terminal owner for prioritization, product tradeoffs, and decisions that affect behavior or roadmap.

#### Change Lead

Terminal owner for approving change requests and accepting implementation risk.

#### Release Lead

Reserved for later phases when deployment and verification are enabled.

#### Knowledge Lead

Owner of durable docs, FAQs, and runbook quality where permanent updates are required.

### 3.3 External Actors

- end user
- founder or operator
- engineer or reviewer
- external systems such as GitHub, email providers, and Telegram

## 4. Core Aggregates

The model should revolve around a few durable aggregates.

### 4.1 Product

Represents the product or service being operated by NestFleet.

Minimum fields:

- `product_id`
- `name`
- `stage`
- `support_policy`
- `enabled_channels`
- `lead_assignments`
- `knowledge_sources`

### 4.2 Identity

Represents a user, customer, operator, or system actor known to NestFleet.

Minimum fields:

- `identity_id`
- `type` (`end_user`, `operator`, `lead`, `system`)
- `display_name`
- `email_addresses`
- `telegram_handles`
- `linked_accounts`

### 4.3 Signal

Represents one inbound or system-generated event.

Examples:

- inbound email
- Telegram message
- GitHub webhook
- scheduled reminder event

Minimum fields:

- `signal_id`
- `product_id`
- `source_type`
- `source_ref`
- `received_at`
- `raw_payload`
- `normalized_payload`
- `identity_id`
- `conversation_id`

### 4.4 Conversation

Represents a channel-specific thread of communication.

Minimum fields:

- `conversation_id`
- `product_id`
- `channel`
- `subject_or_thread_key`
- `participant_ids`
- `status`
- `last_message_at`
- `linked_case_ids`

### 4.5 Case

Represents a specific user-facing issue, request, or product concern.

This is the central operational object in v1.

Minimum fields:

- `case_id`
- `product_id`
- `title`
- `summary`
- `reporter_identity_id`
- `conversation_ids`
- `status`
- `type`
- `severity`
- `urgency`
- `confidence`
- `current_persona`
- `assigned_lead_role`
- `problem_id`
- `change_request_id`
- `github_issue_ref`

### 4.6 Problem

Represents a repeated or systemic underlying issue discovered across cases.

Minimum fields:

- `problem_id`
- `product_id`
- `title`
- `summary`
- `linked_case_ids`
- `status`
- `pattern_confidence`
- `owner_lead_role`

### 4.7 Change Request

Represents a proposed change in code, configuration, docs, or operations.

Minimum fields:

- `change_request_id`
- `product_id`
- `origin_type` (`case`, `problem`, `manual`)
- `origin_ref`
- `title`
- `summary`
- `risk_level`
- `status`
- `requested_by_persona`
- `assigned_lead_role`
- `github_issue_ref`
- `approval_ids`
- `pr_draft_id`

### 4.8 Approval

Represents a human decision over a state-changing action.

Minimum fields:

- `approval_id`
- `target_type`
- `target_ref`
- `requested_role`
- `requested_identity_id`
- `status`
- `decision`
- `rationale`
- `requested_at`
- `decided_at`

### 4.9 PR Draft

Represents the implementation artifact NestFleet produces at the edge of v1 scope.

Minimum fields:

- `pr_draft_id`
- `change_request_id`
- `repository`
- `branch_name`
- `diff_summary`
- `test_summary`
- `status`
- `pull_request_url`

### 4.10 Knowledge Asset

Represents a durable artifact used to resolve future work.

Examples:

- FAQ entry
- known issue record
- runbook
- docs update candidate

Minimum fields:

- `knowledge_asset_id`
- `product_id`
- `asset_type`
- `title`
- `status`
- `source_case_ids`
- `source_change_request_ids`

### 4.11 Notification

Represents one internal or external operational message emitted by the platform.

Minimum fields:

- `notification_id`
- `product_id`
- `kind`
- `audience_type`
- `channel`
- `source_type`
- `source_ref`
- `priority`
- `status`
- `scheduled_for`
- `sent_at`
- `ack_required`
- `ack_status`

### 4.12 Escalation Policy

Represents rules that determine when a notification should escalate.

Minimum fields:

- `escalation_policy_id`
- `product_id`
- `applies_to`
- `priority`
- `timeout_minutes`
- `next_lead_role`
- `retry_strategy`
- `quiet_hours_policy`

### 4.13 Audit Event

Represents an immutable operational record.

Minimum fields:

- `audit_event_id`
- `entity_type`
- `entity_ref`
- `actor_type`
- `actor_ref`
- `action`
- `timestamp`
- `metadata`

### 4.14 Validation Record

Represents the deterministic validation envelope around an AI-assisted proposal or action.

Minimum fields:

- `validation_record_id`
- `target_type`
- `target_ref`
- `proposal_type`
- `policy_version`
- `schema_version`
- `evidence_refs`
- `primary_actor`
- `validator_type`
- `validator_result`
- `requires_human_approval`
- `decision_status`
- `created_at`

### 4.15 Role Template

Represents a reusable role definition shipped by NestFleet.

Minimum fields:

- `role_template_id`
- `name`
- `responsibilities`
- `allowed_issue_classes`
- `allowed_channels`
- `tool_scope`
- `retrieval_profile`
- `notification_profile`
- `approval_boundary`

### 4.16 Active Team Member

Represents an enabled product-scoped instance of a role template.

Minimum fields:

- `team_member_id`
- `product_id`
- `role_template_id`
- `status`
- `lead_role_mapping`
- `channel_scope`
- `tool_scope_override`
- `retrieval_scope_override`
- `notification_policy_ref`

### 4.17 Role Profile Version

Represents a versioned configuration profile for a role template.

Minimum fields:

- `role_profile_version_id`
- `role_template_id`
- `version_label`
- `change_summary`
- `status`
- `evaluation_set_ref`
- `benchmark_result`
- `reviewed_by`
- `promoted_at`

### 4.18 Role Improvement Candidate

Represents a proposed improvement to a role profile generated from outcome and evaluation data.

Minimum fields:

- `role_improvement_candidate_id`
- `role_template_id`
- `product_id`
- `candidate_type`
- `source_outcome_refs`
- `proposed_change_summary`
- `evaluation_status`
- `promotion_status`
- `created_at`

### 4.19 Product Settings (Configuration)

Product-scoped runtime configuration editable through the operator console. Stored as `llm_config JSONB` (and other config columns) within the `products` table. Exposed via `GET /api/v1/products/:id/settings` and `PUT /api/v1/products/:id/settings`. Replaces env-var and seed-script configuration.

**LLM configuration** (within `llm_config JSONB`):

- `provider` — one of: `openai`, `anthropic`, `google`, `azure-openai`, `self-hosted`
- `model` — e.g. `gpt-4o`, `claude-sonnet-4-6`, `gemini-2.0-flash`, `nomic-embed-text`
- `apiKey` — stored as `enc:<iv>:<ciphertext>:<authTag>` (AES-256-GCM, ADR-030); never returned in API responses. API response exposes `apiKeyLast4: "****xxxx"` (via `maskApiKey()`) when key length ≥ 8 chars, `null` otherwise.
- `baseUrl` — optional endpoint override for `azure-openai` and `self-hosted` providers
- `embeddingModel` — separate model name for embedding tasks (defaults per provider: Google `text-embedding-004`, OpenAI `text-embedding-3-small`, self-hosted `nomic-embed-text`)
- `configured` — boolean; `true` when a successful `Test Connection` has been recorded

**Other settings fields:**

- `agent_tone` (`formal`, `friendly`, `technical`)
- `response_templates` (optional overrides for greeting, clarification, resolution)
- `ci_tracking_config` (v1.1: `{ enabled, branch_filter, auto_complete_on_ci_pass, require_deploy_verification }`)
- `updated_at`
- `updated_by`

### 4.20 CI Build Event (v1.1)

Represents a CI pipeline result received via GitHub webhook for a NestFleet-authored PR. Links back to the Change Request that produced the PR.

Minimum fields:

- `ci_event_id`
- `change_request_id` (FK to Change Request)
- `product_id` (FK to Product)
- `github_pr_number`
- `check_suite_id` (GitHub check_suite ID)
- `conclusion` (`success`, `failure`, `neutral`, `cancelled`, `timed_out`)
- `branch`
- `commit_sha`
- `details_url` (link to CI run on GitHub)
- `received_at`

## 5. Relationship Model

The main relationships in v1 should be:

- one `Product` has many `Signals`, `Conversations`, `Cases`, `Problems`, `Change Requests`, `Knowledge Assets`, and `Notifications`
- one `Product` has many `Active Team Members`
- one `Conversation` may create or update one or more `Cases`
- many `Cases` may link to one `Problem`
- one `Case` may create zero or one primary `Change Request` in v1
- one `Change Request` may require many `Approvals`
- one `Change Request` may produce zero or one `PR Draft` in v1
- any `Case`, `Problem`, `Change Request`, `Approval`, or `PR Draft` may emit many `Notifications`
- any material AI-assisted action should produce one or more `Validation Records`
- every significant state transition should create an `Audit Event`
- one `Role Template` may back many `Active Team Members`
- one `Role Template` may have many `Role Profile Versions`
- one `Role Template` may produce many `Role Improvement Candidates`

## 6. Core State Machines

### 6.1 Case State Machine

Suggested states:

- `new`
- `enriching`
- `triaged`
- `awaiting-user`
- `awaiting-lead`
- `in-resolution`
- `in-change`
- `pr-drafting`
- `resolved`
- `closed`

### 6.2 Change Request State Machine

Suggested states:

- `draft`
- `analysis`
- `approval-pending`
- `approved`
- `implementation-prep`
- `pr-drafted`
- `completed`
- `rejected`

### 6.3 Notification State Machine

Suggested states:

- `pending`
- `sent`
- `acknowledged`
- `escalated`
- `suppressed`
- `failed`

### 6.4 Validation Record State Machine

Suggested states:

- `proposed`
- `schema-passed`
- `validator-passed`
- `awaiting-human`
- `approved`
- `rejected`
- `executed`
- `abstained`

## 7. Persona-to-Flow Mapping

### 7.1 Frontline Persona

Owns:

- `Signal -> Conversation -> Case`
- clarifying questions
- user-facing follow-up before change is required

### 7.2 Steward Persona

Owns:

- case classification and prioritization
- problem linking
- safe resolution path
- approval-package creation
- transition from `Case` to `Change Request`

### 7.3 Change Persona

Owns:

- `Change Request -> Approval -> PR Draft`
- engineering context preparation
- implementation outline
- PR-ready draft generation

## 8. Persona Guardrail Baseline

### 8.1 Frontline Persona Guardrails

- may create or update `Conversation`, `Case`, and routine `Notification` records
- must attach evidence-backed summaries when setting case type or severity hints
- must emit a `Validation Record` before user-facing outbound communication is sent automatically

### 8.2 Steward Persona Guardrails

- may create `Problem`, `Change Request`, and approval-package proposals
- must emit a `Validation Record` for escalation, known-issue matching, and change-request creation
- must route to a lead when policy thresholds or confidence thresholds are not met

### 8.3 Change Persona Guardrails

- may create `Change Request`, GitHub-linked engineering records, and `PR Draft` artifacts
- must emit a `Validation Record` before opening or updating a PR draft
- must never transition anything into deployed or production-executed states in v1

### 8.4 Later Advanced Role Guardrails

Later advanced roles such as `L3 Developer` may improve through reviewed profile versions, but they must not:

- rewrite their own policy boundaries live
- expand their own permissions
- promote their own role-profile changes without review

## 9. Lead Routing Model

The first version should use policy-based routing to lead roles instead of a complex approval tree.

### 9.1 Support Lead Routing

Route here when:

- user communication is sensitive
- the case is ambiguous but does not yet require a product change
- a response needs human judgment

### 9.2 Product Lead Routing

Route here when:

- a case implies roadmap or behavior tradeoffs
- a recurring issue becomes a problem record
- a feature request or product decision is required

### 9.3 Change Lead Routing

Route here when:

- a change request is ready for approval
- risk must be accepted before PR drafting
- implementation direction needs human sign-off

### 9.4 Knowledge Lead Routing

Route here when:

- a durable docs or runbook update is required
- a known issue entry should become official guidance

## 10. Notification Model

Notifications are part of the operational backbone.

### 10.1 Required Notification Classes in v1

- approval request
- escalation alert
- reminder
- digest summary
- user follow-up
- PR-ready alert

### 10.2 Notification Audiences

- end user
- founder or operator
- lead role holder
- engineering reviewer

### 10.3 Notification Triggers

Examples:

- case awaiting user input
- case awaiting lead approval
- escalation timeout reached
- recurring problem detected
- change request approved
- PR draft ready for review

### 10.4 Notification Policies

Every notification policy should define:

- audience
- channel
- priority
- quiet hours behavior
- acknowledgement requirement
- escalation timeout
- retry behavior

Recommended v1 defaults:

- priorities should be `critical`, `high`, `normal`, and `low`
- default quiet hours should be `20:00-08:00` local time plus weekends
- `critical` notifications bypass quiet hours, require acknowledgement within `10 minutes`, escalate after `10 minutes`, and repeat every `30 minutes` until acknowledged
- `high` notifications require acknowledgement within `60 minutes` during business hours and defer to the next business window outside quiet hours unless tagged as outage or urgent customer impact
- `normal` notifications require acknowledgement within `4 business hours` with one reminder after `2 business hours`
- `low` notifications do not require acknowledgement and should prefer digest delivery
- digest summaries should default to `09:00` and `17:00` local time

## 11. GitHub-Centric v1 Model

Since GitHub is the mandatory backbone in v1:

- every change-worthy `Case` should link to a GitHub Issue
- every approved `Change Request` should link to a GitHub branch and PR draft when possible
- GitHub metadata should be mirrored into NestFleet records rather than replacing them
- GitHub is an integration backbone, not the full domain model

## 12. Delivery Constraints (current state as of 2026-03-24)

> **Note:** The original v1 constraints have been superseded by post-v1 delivery. This section reflects current production state.

**Shipped and active:**
- Multi-product console (DEFERRED-21 ✅): Acme and AcmePro both live; unlimited products supported per license tier
- Active channels: email ✅, chat widget ✅, contact form ✅, GitHub webhooks ✅, Slack outbound notifications ✅
- Telegram: deferred pending EU legal sign-off
- Minimum viable persona set ✅ (Frontline, Steward, Change); role studio (SLICE-22/23) ✅

**Still constrained:**
- No deployment execution (PR draft is the terminal artifact — operator merges manually)
- No hosted SaaS tier (client-installed only); optional cloud connection for license/updates
- No live AI self-modification (role improvement loop is governed/reviewed, not autonomous)
- Internal-operator-first posture (customer-facing portal API deferred to v2.1)

## 13. Current Working Assumptions

These assumptions should drive the next artifact unless product reality contradicts them:

- initial case classes are `user_request`, `bug_report`, `outage_report`, and `user_feedback`
- the pre-production severity model should use `critical`, `high`, `normal`, and `low`
- one human may hold Support Lead, Product Lead, Change Lead, and Knowledge Lead roles in the first rollout
- the control plane should use queue plus state-machine orchestration, with AI personas acting as bounded workers inside governed transitions
- the v1 GitHub target should assume one primary repository per product where possible, while still allowing adaptation if the product already lives in a monorepo
- v1 should support enabling or disabling shipped role templates per product, but not arbitrary user-authored role definitions
- later advanced roles may use governed role-improvement loops, but live self-modification is out of bounds
