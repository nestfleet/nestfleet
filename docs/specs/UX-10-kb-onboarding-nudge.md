# UX-10 — Knowledge Base Onboarding Nudge

> **Status:** Not Started
> **Size:** S
> **Priority:** P1
> **Branch:** `feat/UX-10-kb-onboarding-nudge`

---

## Problem

Agent triage quality depends directly on the product knowledge base. A product with zero KB sources gets generic, low-confidence replies. Users configure channels, cases start arriving, quality feels poor — and they churn without ever understanding why or knowing what to do about it.

Currently there is no prompt anywhere in the product creation or onboarding flow to add KB sources.

---

## Goal

Surface the knowledge base dependency at the two moments users are most receptive:
1. **Right after product creation** — wizard completion screen
2. **While the KB is empty and cases exist** — persistent inline nudge on the Knowledge page

---

## User Story

As a new NestFleet operator, I want to understand that the AI agents use my product's knowledge base during onboarding, so that I add relevant sources before my first real case arrives.

---

## Acceptance Criteria

- [ ] **Wizard step 5 — "Next steps" screen**: after product creation succeeds, show a summary screen (not a modal close) with three recommended next steps: Add KB sources (highlighted), Invite team, Configure notifications. Each links to the relevant page. "Go to Dashboard" dismisses.
- [ ] **KB empty-state nudge**: when `sources.length === 0` AND the product has at least one case (any status), replace the generic "No memory sources yet" copy with an amber nudge explaining quality impact + "Add your first source" button.
- [ ] **Wizard nudge copy** is clear that quality is directly affected ("Agents answer from your knowledge base — add docs, FAQs, or known issues now for best results").
- [ ] No new API calls required — wizard already has the productId after creation; KB page already fetches sources.

---

## Technical Design

### Wizard — Step 5 (new)

Extend `WizardStep` type: `1 | 2 | 3 | 4 | 5`

After `handleCreate()` succeeds (product created), instead of calling `onClose()`, advance to step 5.

Step 5 renders:
```
✅ "[ProductName]" is ready

Recommended next steps:

📚  Add knowledge sources          → /p/[slug]/knowledge
    Agents answer from your KB —
    add docs, FAQs, or runbooks
    for best triage quality.       [Add sources →]  ← primary CTA

👥  Invite your team              → Settings → Team
💬  Configure notifications       → Settings → Notifications

                          [Go to Dashboard →]
```

- Primary CTA "Add sources →" navigates to the product Knowledge page and closes wizard
- "Go to Dashboard →" closes wizard and navigates to product dashboard
- No Back button on step 5 (product already created)

`AddProductWizard` currently calls `onSuccess(newProduct)` after create — keep that call but also advance to step 5 so parent can refresh product list while wizard shows the next-steps screen.

### KB page — enriched empty state

In `console/src/app/knowledge/page.tsx`, the `sources.length === 0` branch:

- Always show: icon + headline "No knowledge sources yet"
- When `cases > 0` (fetch case count from existing `getCasesApi` or add lightweight `getProductStatsApi` — prefer reusing existing data already available on the page if any):
  - Show amber panel: *"Your agents are handling cases without product context. Add docs, FAQs or known issues to improve triage accuracy and auto-reply quality."*
- Show "Upload a document" / "Add URL" action regardless (already present for admins, just move it up)

To avoid a new API call: check if the page already has access to case count (via stats or dashboard data). If not, add a simple `GET /api/v1/products/:productId/cases?limit=1` — if `data.length > 0` show the nudge. One call, cached by SWR.

---

## Out of Scope

- Checklist widget / progress tracker (separate feature)
- Sidebar KB completeness indicator (deferred — low signal value without knowing what "complete" means per product)
- Forcing users to add KB before going live

---

## Size Breakdown

| Sub-task | Size |
|----------|------|
| Wizard step 5 "next steps" screen | XS |
| KB empty-state amber nudge (with case-count check) | XS |
| Tests (console type-check + E2E-ready markup) | XS |
