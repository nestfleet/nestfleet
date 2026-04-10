# FEAT-015 — Correct Triage

> **Status:** Not Started
> **Size:** M
> **Priority:** P2
> **Branch:** `feat/FEAT-015-correct-triage`

---

## Problem

The triage agent classifies every incoming case by type (bug / request / question / outage) and severity (low / medium / high / critical). These decisions gate the entire downstream flow — a `question` goes to Steward, a `change` spawns a CR, an `outage` triggers escalation. On a fresh instance with no KB context, and occasionally even with KB loaded, the LLM gets the type wrong.

There is currently no way for an operator to correct a misclassification. The case stays in the wrong flow, producing wrong artifacts (e.g. a CR for a general support question), with no recovery path.

Observed in FREE community simulation (2026-04-10): BEF-34 (question → Change flow), BEF-35 (bug → Request).

---

## Design Principle

> **Re-inject at the triage boundary, let the existing pipeline handle the rest.**

The wrong decision happened at triage. The fix is to undo that one decision, then let the state machine and pipeline execute from there exactly as they would have on a correct first pass. No separate rollback engine. No per-state correction logic. The pipeline already knows how to handle a correctly-triaged case — we just need to give it a second chance with the right input.

---

## User Story

As a NestFleet operator (Lead or Admin), I want to correct the type and/or severity of a misclassified case so that the right flow runs, the right people are notified, and any wrongly-created artifacts are cleanly removed — without me having to manually undo each downstream step.

---

## Acceptance Criteria

- [ ] "Correct Triage" action available on any non-resolved case for Lead and Admin roles
- [ ] Operator can change: case type, severity, or both
- [ ] Operator must provide a short reason (required, max 200 chars)
- [ ] Any CR created under the wrong type is automatically cancelled with a note
- [ ] Case is reset to `triaged` state and re-dispatched into the pipeline
- [ ] The corrected type/severity is injected as a triage hint so the agent does not re-classify back to the wrong type
- [ ] Correction is logged as a lineage event with actor, old values, new values, reason
- [ ] Change Lead notified if a CR was cancelled as a result
- [ ] Action is blocked (disabled, with tooltip) on `resolved` and `processing-failed` cases — correction on resolved is audit-only (see §Out of Scope)
- [ ] Severity-only corrections on `awaiting-lead` or `reply-drafted` cases do not trigger a full re-run — only relabel + re-evaluate priority routing

---

## State Machine Impact

### Which states can be corrected?

| Current State | Correction Allowed | Re-run triggered? |
|---|---|---|
| `triaged` | ✅ Yes | Yes — re-dispatch immediately |
| `enriching` | ✅ Yes | Yes — cancel current job, re-dispatch |
| `awaiting-lead` | ✅ Yes | Yes — discard draft, reset to triaged |
| `reply-drafted` | ✅ Yes | Yes — discard draft, reset to triaged |
| `in-change` | ✅ Yes | Yes — cancel CR, reset to triaged |
| `awaiting-approval` | ✅ Yes | Yes — cancel CR + approval request, reset to triaged |
| `in-resolution` | ✅ Yes | Yes — reset to triaged (reply not yet sent) |
| `resolved` | ❌ Blocked | Audit-only — see §Out of Scope |
| `processing-failed` | ❌ Blocked | Use Retry action instead |

### Correction flow (all non-resolved states)

```
Operator submits correction
        ↓
1. Cancel wrong artifacts
   - If CR exists (in-change / awaiting-approval):
       → Set CR status = "cancelled", reason = "Triage correction by [actor]"
       → Notify Change Lead
   - If reply draft exists: discard silently (no notification — not yet sent)
        ↓
2. Update case
   - Set type = corrected_type
   - Set severity = corrected_severity
   - Set status = "triaged"
   - Clear: triage_output.crId, draft fields
   - Write lineage event: "Triage corrected"
        ↓
3. Re-dispatch pipeline job
   - Inject triage_hint: { type: corrected_type, severity: corrected_severity, reason: operator_reason }
   - Hint is prepended to the triage agent system prompt:
     "OPERATOR OVERRIDE: This case has been confirmed as [type] / [severity].
      Reason: [reason]. Do not reclassify."
        ↓
4. Pipeline runs as normal from triaged state
```

### Severity-only fast path

If type is unchanged and only severity is corrected, and the case is in `awaiting-lead` or `reply-drafted`:
- Update severity only
- Re-evaluate priority routing (does this now need Change Lead escalation instead of Steward?)
- No full re-run, no draft discard
- Log lineage event: "Severity corrected"

---

## API Contract

### POST `/api/v1/products/:productId/cases/:caseId/correct-triage`

**Auth:** requireAuth(), requireRole("lead" | "admin")

**Request body:**
```typescript
{
  type?:     "bug" | "request" | "question" | "outage"  // at least one required
  severity?: "low" | "medium" | "high" | "critical"     // at least one required
  reason:    string  // required, 1–200 chars
}
```

**Responses:**
- `200` — correction applied, pipeline re-dispatched
- `400` — neither type nor severity provided; or reason missing
- `409` — case is resolved or processing-failed (use appropriate action)
- `404` — case not found or no access

**Response body:**
```typescript
{
  ok: true,
  correction: {
    caseId:      string
    oldType:     string
    newType:     string
    oldSeverity: string
    newSeverity: string
    reason:      string
    crCancelled: boolean   // true if a CR was cancelled
  }
}
```

---

## Lineage Event

```
Triage corrected by Jane Smith
  Bug → Question  ·  critical → low
  Reason: "User asked about Zapier integration, not reporting a bug"
  [CR-42 cancelled]
```

Event type: `triage_corrected`
Actor: operator user
Stored in: `case_events` table (existing lineage infrastructure)

---

## UX Flow

### Trigger
"Correct Triage" appears in the case detail action bar alongside existing actions (Resolve, Forward, etc.). Visible only to Lead and Admin. Disabled with tooltip for resolved/processing-failed cases.

### Modal
```
┌─────────────────────────────────────────────┐
│  Correct Triage                             │
│                                             │
│  Type                                       │
│  [Bug] [Request] [Question ✓] [Outage]      │
│                                             │
│  Severity                                   │
│  [Low ✓] [Medium] [High] [Critical]         │
│                                             │
│  Reason (required)                          │
│  ┌─────────────────────────────────────┐   │
│  │ User asked about Zapier, not a bug  │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  ⚠ This will cancel CR-42 and re-run       │
│    triage from the beginning.               │
│                                             │
│  [Cancel]              [Apply Correction]   │
└─────────────────────────────────────────────┘
```

**Warning banner** shown when:
- A CR will be cancelled (`in-change` / `awaiting-approval`)
- A reply draft will be discarded (`reply-drafted` / `awaiting-lead`)

**No warning** for `triaged` / `enriching` — nothing to undo yet.

After submit: modal closes, case card refreshes, lineage timeline shows the correction event, toast: "Triage corrected — pipeline restarted".

---

## Implementation Checklist

### Backend
- [ ] `POST /correct-triage` route in `src/api/v1/cases.ts`
- [ ] Zod schema validation (type | severity, reason required)
- [ ] `correctTriage()` service function:
  - [ ] Load case, validate state (reject resolved/processing-failed)
  - [ ] Cancel CR if exists (update `change_requests` table, notify Change Lead)
  - [ ] Update case (type, severity, status → triaged, clear stale fields)
  - [ ] Write `triage_corrected` lineage event
  - [ ] Dispatch pg-boss job with triage_hint payload
- [ ] Triage agent reads `triage_hint` from job data and prepends override instruction to system prompt
- [ ] Migration: no schema change needed (triage_hint is job payload, not persisted)

### Frontend
- [ ] "Correct Triage" button in case detail action bar (Lead + Admin only)
- [ ] `CorrectTriageModal` component — type selector, severity selector, reason textarea, warning banner
- [ ] `correctTriageApi()` in `lib/api.ts`
- [ ] Lineage timeline renders `triage_corrected` event with old/new values
- [ ] Toast on success; error state on 409/400

---

## Out of Scope

- **Resolved cases:** type/severity label correction for audit purposes only (no re-run). If needed in future, a separate lightweight "Relabel" action (no pipeline involvement) can be added.
- **Bulk correction:** not in scope — corrections are case-by-case operator decisions.
- **Auto-learning:** corrections feeding back into fine-tuning or prompt adjustment is a future capability. For now, the `reason` field is the human record.
- **CR partial rollback:** if a CR was already approved and acted on (e.g. code merged), cancellation is noted in lineage but the code change is not reverted — that is an engineering decision outside NestFleet's scope.
