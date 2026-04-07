# NestFleet Notification Model

## 1. Purpose

This document defines how NestFleet emits, routes, suppresses, retries, escalates, and audits notifications in v1.

Notifications are not auxiliary UX output. They are operational control signals.

## 2. Scope Assumptions

- v1 is `internal-operator first`
- v1 channels are `email` and `Telegram`
- notification policy must remain compatible with the legal and audit baselines in `docs/legal-compliance-eu-germany.md`

## 3. Notification Principles

- every important event produces a normalized notification event
- internal and external notifications follow separate policies
- acknowledgement and escalation are part of the notification model
- deduplication must happen before delivery
- quiet hours must be policy-driven, not hard-coded
- every notification must be traceable to a source entity and event

## 4. Canonical Notification Object

Each notification should carry at least:

- `notification_id`
- `product_id`
- `kind`
- `priority`
- `audience_type`
- `channel`
- `source_type`
- `source_ref`
- `correlation_id`
- `scheduled_for`
- `ack_required`
- `ack_deadline`
- `status`

## 5. Notification Classes

### 5.1 Internal Notifications

- `approval_request`
- `escalation_alert`
- `reminder`
- `digest_summary`
- `pr_ready`
- `stale_case_alert`
- `stale_change_alert`

### 5.2 External Notifications

- `user_follow_up`
- `clarification_request`
- `resolution_message`
- `status_update`

## 6. Audience Model

| Audience | Typical use |
| --- | --- |
| operator | queue review, routine follow-up, digest reading |
| Support Lead | sensitive communication, stalled user issues, critical support conditions |
| Product Lead | repeated pain, product tradeoffs, problem creation |
| Change Lead | approval queue, engineering readiness, PR-ready review |
| Knowledge Lead | docs updates, known-issue publication, runbook review |
| end user | clarification, acknowledgement, resolution, status follow-up |

## 7. Channel Model

### 7.1 v1 Delivery Channels

- email
- Telegram

### 7.2 Channel Rules

- internal notifications may use email or Telegram
- external notifications should use the same channel as the originating conversation unless policy says otherwise
- `critical` internal alerts should attempt a secondary channel if the primary channel is not acknowledged

## 8. Priority Model

| Priority | Meaning | Ack policy |
| --- | --- | --- |
| `critical` | outage, major blocked flow, or severe risk requiring immediate human visibility | yes |
| `high` | urgent but not active incident | yes |
| `normal` | routine work requiring timely follow-up | yes |
| `low` | informational, batchable, or suggestion-only | no |

## 9. Quiet Hours and Acknowledgement Defaults

- default quiet hours are `20:00-08:00` local time plus weekends
- `critical` bypasses quiet hours
- `critical` ack deadline is `10 minutes`
- `critical` escalates after `10 minutes`
- `critical` repeats every `30 minutes` until acknowledged
- `high` ack deadline is `60 minutes` during business hours
- `normal` ack deadline is `4 business hours`
- `normal` gets one reminder after `2 business hours`
- `low` defaults to digest delivery only
- digest windows default to `09:00` and `17:00` local time

## 10. Event-to-Notification Mapping

| Source event | Notification | Audience | Priority | Ack required |
| --- | --- | --- | --- | --- |
| case enters `awaiting-lead` | `approval_request` | mapped lead | `high` or `normal` | yes |
| outage report triaged as `critical` | `escalation_alert` | operator plus Support Lead and Product Lead | `critical` | yes |
| change request approved | `reminder` or `pr_ready` prep alert | Change Lead or engineer reviewer | `normal` | yes |
| PR draft created | `pr_ready` | Change Lead and engineering reviewer | `high` | yes |
| case stuck in `awaiting-user` | `reminder` | end user or operator depending on state | `normal` | external no, internal yes |
| recurring problem detected | `digest_summary` or `escalation_alert` depending on impact | Product Lead | `normal` or `high` | policy-based |
| docs update candidate created | `digest_summary` | Knowledge Lead | `low` | no |

## 11. Deduplication and Suppression

Notifications should be collapsed by:

- `product_id`
- `source_type`
- `source_ref`
- `kind`
- `priority`

Default suppression rules:

- do not resend identical reminders within the active retry window
- collapse multiple related low-priority signals into the next digest window
- replace an older pending notification with a newer higher-priority notification for the same source

## 12. Escalation Logic

Escalation should follow lead routing and priority rules:

- `critical`: operator -> Support Lead and Product Lead -> secondary channel retry
- `high`: primary mapped lead -> reminder -> optional secondary channel after missed ack
- `normal`: primary mapped lead -> one reminder -> digest fallback if still unresolved and policy allows
- `low`: no escalation, digest only

## 13. User-Facing Notification Rules

- use channel-aware templates
- preserve AI disclosure where required
- avoid marketing content in support flows
- queue non-critical user messages for the next business window during quiet hours
- never send unsupported root-cause claims or unsupported promises

## 14. Delivery and Retry Semantics

- delivery should be at-least-once with idempotent deduplication keys
- failed deliveries should requeue with backoff
- final delivery failure should emit an internal alert
- delivery attempts must be auditable

## 15. Notification Metrics

- send success rate
- acknowledgement latency
- escalation rate
- quiet-hours deferral count
- duplicate-suppression count
- notification-to-action conversion rate
- user-facing correction rate

## 16. v1 Non-Goals

- broad multichannel marketing automation
- custom user-configurable notification builders
- voice, SMS, or phone-call escalation
- complex incident paging rotations
