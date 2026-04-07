# NestFleet MVP Scope

## 1. Purpose

This document defines the first shippable version of NestFleet. Its job is to validate the core thesis with the minimum feature set that can operate a real product with meaningful human time savings.

## 2. MVP Objective

Prove that NestFleet can operate `DocuGardener` as an internal-first AI product operations team that:

- handles real inbound product issues from email and Telegram
- grounds decisions in product memory
- routes work through deterministic policies and approvals
- prepares GitHub-backed change work up to approved PR draft

## 3. Target Users in MVP

- founder or operator
- Support Lead
- Product Lead
- Change Lead
- Knowledge Lead

In the first rollout, one human may hold several of these roles.

## 4. MVP Scope Boundary

### 4.1 In Scope

- one live product: `DocuGardener`
- one follow-on product candidate: `SkillSeal`
- channels: `email` and `Telegram`
- personas: `Frontline`, `Steward`, `Change`
- configurable activation of shipped role templates per product
- core records: signal, conversation, case, problem, change request, approval, PR draft, notification, validation record, audit event
- product memory grounded in docs, GitHub context, known issues, and approved case history
- internal operator queue and approval workflow
- GitHub Issues and GitHub Projects as default work-management backbone
- GitHub PR draft preparation
- notification control plane
- knowledge capture after resolution

### 4.2 Issue Classes in Scope

- user requests and how-to questions
- bug reports
- downtime and outage reports
- user feedback

### 4.3 Automation in Scope

- summarization and classification
- clarification questions
- duplicate and known-issue suggestion
- low-risk grounded replies for routine user requests
- problem and change draft creation
- approval package generation
- PR draft preparation after approval

### 4.4 Out of Scope

- deployment execution
- post-release verification automation
- AI chat channel
- multi-product concurrent operation
- broad custom workflow designer
- arbitrary user-authored role builder
- live self-improving roles
- enterprise ITSM feature breadth
- HR, worker-monitoring, or other regulated high-risk decision workflows

## 5. MVP Operator Experience

The MVP should feel like an internal control console, not a polished end-user self-service suite.

Required operator surfaces:

- inbox and queue view (with AI-resolved badge for autonomously resolved cases)
- case detail with conversation and evidence
- approval queue
- change request view
- notification center (with acknowledgement and escalation indicators)
- PR draft review handoff
- settings pane (LLM provider, lead assignments, agent tone, quiet hours)
- first-run configuration wizard (guided onboarding for new installations)

## 6. Product Memory Scope

The MVP product memory layer should index only trusted sources:

- markdown docs
- FAQ or help content
- GitHub issues
- GitHub pull request metadata
- release notes
- approved known issues
- approved historical cases

The MVP should not rely on broad uncontrolled ingestion.

## 7. Deployment Shape

- default runtime is client-installed on customer infrastructure
- all customer data stays on customer systems and never reaches NestFleet infrastructure
- NestFleet Cloud provides a thin update and value-delivery channel transmitting zero customer data
- customer configures their own LLM provider (NestFleet does not proxy model calls)
- architecture must support single-machine and multi-node deployments on customer infrastructure
- an optional hosted SaaS tier may be offered later as a premium option
- details are defined in `docs/monetization-and-licensing-model.md`

## 8. OSS-First Constraint

The MVP should maximize OSS components for:

- application runtime
- storage
- queueing
- retrieval
- observability
- identity and access

Paid components are acceptable only when there is no credible OSS alternative or when the paid option materially reduces delivery or compliance risk.

## 9. Success Criteria

The MVP is successful when it can:

- intake and normalize real DocuGardener cases reliably
- auto-answer a meaningful subset of routine user requests safely
- prepare change work for bug and outage cases with clear approval routing
- produce approved PR drafts tied back to cases and change requests
- maintain auditability and notification discipline without manual glue work

## 10. Exit Criteria to Post-MVP Phase

Before expanding beyond MVP, NestFleet should show:

- stable notification behaviour with acceptable noise
- acceptable false-positive and unsupported-claim rates
- acceptable PR draft usefulness after human review
- product memory quality good enough to support grounded automation
- policy and approval model stable enough to add deployment coordination later

## 11. Recommended MVP Delivery Order

### 11.1 Slice 1: Intake and Control Plane

- connectors
- signal normalization
- case creation
- operator queue
- notification basics

### 11.2 Slice 2: Grounded Resolution

- product memory ingestion
- retrieval and evidence packs
- low-risk user-request responses
- known-issue matching

### 11.3 Slice 3: Change Preparation

- problem records
- change requests
- approval queue
- GitHub issue sync

### 11.4 Slice 4: PR Draft Edge

- implementation context assembly
- repo-aware validation
- PR draft generation
- change completion workflow

### 11.5 Slice 5 Later: Governed Role Improvement

- collect role outcome telemetry
- build evaluation datasets
- test role-profile candidates in shadow mode
- promote reviewed role-profile versions for advanced roles

## 12. MVP Risks

- weak product memory quality will undermine reply quality and triage quality
- notification noise can erode operator trust quickly
- GitHub permissions and repo structure may slow the change workflow
- Telegram may introduce higher compliance and governance overhead than email
