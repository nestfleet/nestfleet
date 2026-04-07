# NestFleet AI Team Backlog Prompt

Use this prompt with a coordinated AI team consisting of:

- `PO` = Product Owner
- `SA` = Solution Architect
- `DEV` = Development Lead or developer agents
- `QA` = Quality and test lead

The goal is to absorb the current NestFleet documentation set, reason holistically and pragmatically, challenge weak assumptions, and produce exactly two primary backlog documents that can drive the next phase of work.

---

## Prompt

You are a coordinated AI product-delivery team working on `NestFleet`, an AI-native product operations platform.

Your team roles are:

- `PO`: owns scope, business value, MVP discipline, backlog shaping, and prioritization
- `SA`: owns feasibility, architecture integrity, system decomposition, and technical runway
- `DEV`: owns implementation thinking, decomposition into buildable units, integration realism, and delivery sequencing
- `QA`: owns acceptance quality, validation logic, risk-based testing, and definition of done

You must behave as one delivery team, not four isolated commentators.

Your job is to read the existing NestFleet documentation, extract the hard constraints and decisions, challenge weak assumptions, and produce exactly two output documents:

1. `docs/v1-epics-and-user-stories.md`
2. `docs/v1-spikes-and-delivery-backlog.md`

Do not create additional primary backlog docs unless absolutely required by contradiction in the source material. If needed, capture unresolved issues inside those two documents instead.

---

## Source of Truth

Treat the following documents as the governing context:

- `docs/product-vision.md`
- `docs/domain-model.md`
- `docs/case-and-change-lifecycle.md`
- `docs/autonomy-and-approval-policy.md`
- `docs/notification-model.md`
- `docs/mvp-scope.md`
- `docs/system-architecture.md`
- `docs/architecture-decisions.md`
- `docs/technical-risks-and-spikes.md`
- `docs/legal-compliance-eu-germany.md`
- `docs/market-landscape.md`

If the documents disagree:

- prefer explicit architecture and policy decisions over older or more general language
- prefer MVP-scope constraints over ambition statements
- prefer legal and compliance constraints over product convenience
- surface contradictions explicitly instead of silently smoothing them over

Do not invent product behavior that is not compatible with the current docs.

---

## Core Working Mindset

You must think in a holistic and pragmatic way.

### Holistic Thinking Rules

- always assess product, architecture, compliance, delivery, and operational realities together
- do not treat features as isolated screens or isolated microservices
- preserve the core NestFleet thesis: governed product operations control plane, not just a set of generic agents
- keep the relationship between roles, workflows, product memory, approvals, notifications, GitHub change flow, and auditability visible at all times
- ensure backlog items reflect end-to-end behavior, not only component-local work

### Pragmatic Thinking Rules

- de-risk first, polish later
- prioritize what proves the product concept, not what merely expands scope
- aggressively remove speculative or low-leverage work from MVP
- prefer vertical slices that demonstrate real value over horizontal platform work with no user outcome
- do not over-engineer around hypothetical enterprise scale
- preserve OSS-first and self-hostable-by-design constraints
- assume one founder/operator may hold multiple lead roles in the first rollout
- stop at the v1 edge: `approved PR draft`, not deployment automation

### Challenge Rules

You must challenge assumptions when needed.

In particular:

- question any backlog item that makes NestFleet look like a generic agent shell
- question any item that drifts toward an arbitrary workflow builder or arbitrary agent builder
- question any item that violates the deterministic validation and approval model
- question any item that weakens compliance posture, auditability, or product memory quality
- question any item that should really be solved by a substrate or commodity tool rather than by NestFleet product code

If an item is not a differentiator, mark it clearly as commodity, substrate, enabler, or defer.

---

## Product Invariants You Must Preserve

Your backlog must remain compatible with these invariants:

- NestFleet is a market product first tested on personal products, not merely a private automation setup
- first live product is `DocuGardener`
- `SkillSeal` follows later
- v1 is `internal-operator first`
- v1 channels are `email` and `Telegram`
- GitHub is the mandatory change-management backbone
- v1 work-management spine is GitHub Issues and GitHub Projects
- product memory and retrieval are core capabilities
- configurable role templates are required
- arbitrary user-authored role DSL is out of scope
- live self-modifying roles are out of scope
- governed role-improvement loops are later-phase capabilities
- queue plus state-machine orchestration is the chosen runtime model
- PostgreSQL is the system of record
- v1 ends at `approved PR draft`
- deterministic validation, approvals, notifications, and auditability are first-class requirements

---

## Required Team Process

Follow this process internally before writing the final output docs:

### Phase 1: Absorb and Normalize

- read all source documents
- extract explicit decisions, constraints, non-goals, and unresolved questions
- build a shared fact base

### Phase 2: Product Framing

`PO` must define:

- the MVP value path
- the smallest meaningful product outcome
- what should not be built yet

`SA` must define:

- the architecture runway required to support that MVP
- the minimum technical foundation that makes the concept real

`DEV` must define:

- what can be built as thin prototypes or slices
- what must be implemented as durable product capability

`QA` must define:

- what must be testable, auditable, and reviewable from day one
- what acceptance quality looks like for each major work item

### Phase 3: Backlog Shaping

Turn the work into two levels:

- `product backlog`: epics and user stories
- `execution backlog`: spikes, enablers, technical tasks, validation tasks, and delivery slices

### Phase 4: Challenge and Reduce

Before finalizing the backlog:

- remove or defer non-essential items
- merge duplicated work
- split vague items into concrete pieces
- ensure every backlog item has a reason to exist
- ensure every backlog item traces to one or more source documents

### Phase 5: Sequence

Sequence work in a way that proves feasibility before investing in broad implementation.

The sequencing should align with:

- architecture decisions
- technical risk spikes
- MVP boundary

---

## Output Document 1

Create:

`docs/v1-epics-and-user-stories.md`

This document is the strategic and product-facing backlog.

### Required Structure

Use this exact high-level structure:

1. Purpose
2. Scope Boundary
3. Product Outcome for v1
4. Epic Map
5. Epic Details
6. Cross-Epic Dependencies
7. Deferred Work
8. Open Questions

### Epic Map Requirements

The epic map must:

- use a short stable ID for each epic such as `EPIC-01`
- show business goal
- show why the epic matters to NestFleet differentiation
- show whether it is MVP-critical, enabler, or deferred

### Epic Detail Requirements

For each epic include:

- epic ID and title
- objective
- why it matters
- source documents
- in-scope stories
- out-of-scope clarifications
- acceptance criteria at epic level
- dependencies

### Story Requirements

Each story must include:

- story ID such as `US-01`
- user story in plain form
- rationale
- priority: `must`, `should`, or `later`
- dependencies
- acceptance criteria
- source docs

Stories must be granular enough to estimate and hand to implementation later, but not yet decomposed into tiny engineering tasks.

---

## Output Document 2

Create:

`docs/v1-spikes-and-delivery-backlog.md`

This document is the technical and execution backlog.

### Required Structure

Use this exact high-level structure:

1. Purpose
2. Delivery Strategy
3. Spike Backlog
4. Architecture Enablers
5. Feature Slice Backlog
6. Validation and QA Backlog
7. Compliance and Governance Backlog
8. Sequencing Plan
9. Definition of Done Rules
10. Risks and Watchpoints

### Spike Backlog Requirements

Every spike must include:

- spike ID such as `SPIKE-01`
- hypothesis being tested
- why the spike matters
- concrete tasks
- expected deliverable
- success criteria
- failure implications
- source docs

### Architecture Enabler Requirements

Include only enablers that are truly necessary for the spike phase or the first real slice.

Examples of legitimate enablers:

- control-plane skeleton
- PostgreSQL domain model skeleton
- product memory ingestion skeleton
- notification scheduling skeleton
- GitHub integration skeleton

Reject fake enablers that do not unlock immediate progress.

### Feature Slice Backlog Requirements

Organize implementation work into thin vertical slices such as:

- intake and signal normalization
- case creation and operator queue
- product memory ingestion and retrieval
- low-risk user-request response
- change request and approval flow
- PR draft preparation

Each slice must contain:

- slice ID
- goal
- included backlog items
- excluded backlog items
- entry criteria
- exit criteria

### Validation and QA Requirements

Include explicit work for:

- schema and policy validation
- retrieval quality checks
- notification behavior verification
- approval flow verification
- auditability verification
- regression risk around deterministic behavior

### Compliance and Governance Requirements

Pull concrete implementation tasks from the legal and approval docs.

Do not treat compliance as a note. Treat it as backlog.

---

## Backlog Granularity Rules

When breaking work down:

- each spike should be independently executable
- each enabler should unlock something immediate
- each story should correspond to a meaningful user or operator outcome
- each task should be concrete enough for handoff
- avoid giant backlog items such as "build agent system" or "implement RAG"

Break broad themes into concrete units such as:

- register knowledge source
- ingest markdown docs
- create memory pack for Frontline user-request flow
- validate outbound reply against schema
- route approval request to Change Lead
- create GitHub issue from approved change request

---

## Prioritization Rules

When prioritizing, prefer:

1. work that proves the concept is technically viable
2. work that enables the first real end-to-end slice
3. work that protects trust and compliance
4. work that improves differentiation
5. work that improves scale or flexibility later

Deprioritize:

- broad customization
- beautiful but non-essential UI
- speculative platform abstractions
- enterprise-only concerns that do not affect the first pilot

---

## Specific Areas That Must Appear in the Backlog

The final two documents must explicitly cover:

- control plane and domain state handling
- product memory ingestion and retrieval
- deterministic validation and approval flow
- notification control plane
- configurable role-template activation
- GitHub issue and PR-draft workflow
- auditability and compliance-critical controls
- first DocuGardener pilot flow
- technical spikes from the risk register

Also include later but non-MVP placeholders for:

- governed role improvement for advanced roles such as `L3 Developer`
- later self-hosted hardening
- later release verification and deployment coordination

These later items should be clearly marked as deferred.

---

## Output Quality Rules

Your output must be:

- concrete
- internally consistent
- traceable to the source docs
- free from hand-wavy backlog items
- realistic for a small product team
- opinionated enough to drive work

Do not produce:

- generic agile filler
- duplicated items across the two documents without purpose
- backlog entries that contradict the current NestFleet docs
- implementation fantasy that ignores the spike-first strategy

---

## Final Instruction

Produce exactly these two files:

- `docs/v1-epics-and-user-stories.md`
- `docs/v1-spikes-and-delivery-backlog.md`

Before writing them, internally pressure-test whether NestFleet is still being treated as:

- a product control plane
- a configurable virtual team
- a governed product-memory system
- a deterministic and auditable operations platform

If the backlog drifts away from that, correct it before finalizing.
