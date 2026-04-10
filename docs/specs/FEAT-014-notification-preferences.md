# FEAT-014 — Notification Preferences

> **Status:** Not Started
> **Size:** M
> **Priority:** P2
> **Branch:** `feat/FEAT-014-notification-preferences`

---

## Problem

Every case lifecycle event currently triggers an email notification to the operator. During normal operation (and especially during beta testing with a single operator), this creates noise — most events are informational and do not require immediate action. There is no way to silence specific event types without turning off all notifications.

## Goal

Allow operators to configure which events send email vs appear in the console inbox only.

---

## User Story

As a NestFleet operator, I want to control which case/CR events send me an email, so that my inbox only contains notifications that require my action — and I can track informational updates in the console at my own pace.

---

## Acceptance Criteria

- [ ] Settings → Notifications page lists all notification event types with a toggle per event
- [ ] Each event defaults to a sensible preset (see §Event Classification below)
- [ ] Preferences are stored per-product in the DB
- [ ] Email is skipped (but console notification still created) when operator disables email for an event
- [ ] Changes take effect immediately — no restart required
- [ ] Preferences are respected by `NotificationService.emit()`

---

## Event Classification

| Event | Default | Rationale |
|-------|---------|-----------|
| CR approval requested | Email ✅ | Actionable — human must approve/reject |
| Case escalated to Lead | Email ✅ | Actionable — human intervention needed |
| Case processing-failed | Email ✅ | Actionable — retry or investigate |
| CR rejected | Email ✅ | Actionable — case returned to lead |
| Auto-reply sent | Console only | Informational |
| Case triaged | Console only | Informational |
| Case resolved | Console only | Informational |
| Case awaiting user | Console only | Informational |
| Draft reply sent | Console only | Informational |
| CR approved | Console only | Informational |
| CR pr-drafted | Console only | Informational |

---

## Technical Design

### DB

Add `notification_preferences JSONB` column to `products` table (migration):

```sql
ALTER TABLE products
  ADD COLUMN notification_preferences JSONB NOT NULL DEFAULT '{}';
```

Schema shape:
```json
{
  "email_disabled_events": ["case.triaged", "case.resolved", "auto_reply.sent"]
}
```

### API

- `GET /api/v1/products/:productId/notification-preferences` — returns current prefs
- `PUT /api/v1/products/:productId/notification-preferences` — updates prefs (operator role)

### NotificationService

In `NotificationService.emit()`, before dispatching email transport:
1. Load product notification preferences
2. If `action` is in `email_disabled_events`, skip email but still create console notification record

### Console

New section in Settings → Notifications (or Settings → Product):
- Toggle list grouped by category (Actionable / Informational)
- Auto-saves on toggle change (debounced PUT)

---

## Out of Scope

- Per-user preferences (product-level only for now)
- Quiet hours / digest mode (separate feature — CHAT-UX-01 dependency)
- Slack/webhook notification channels (separate feature)
- End-user notification preferences (operator-facing only)

---

## Dependencies

- `NotificationService` (`src/notifications/index.ts`)
- `notification_model.md` reference doc

---

## Size Breakdown

| Sub-task | Size |
|----------|------|
| DB migration + product repo update | XS |
| GET/PUT preferences API endpoints | XS |
| NotificationService email gate | XS |
| Console Settings UI (toggle list) | S |
| Tests (unit + integration) | S |
