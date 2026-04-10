# FEAT-017 — Customer Subscription Lifecycle

> **Status:** Spec complete, not started  
> **Priority:** P1 (blocking first paying customer)  
> **Size:** M  
> **Depends on:** FEAT-016 (SaaS signup form — ✅ Done), FEAT-012 (license reissue worker — ✅ Done)

---

## 1. Architecture decision (confirmed)

**Customer VPS has no billing capability.** `BILLING_ENABLED=false` on all customer VPSes — by design, per FEAT-001 spec §4. This is non-negotiable: billing state must not be split across 50+ VPSes.

**All subscription management runs on the main NestFleet instance (`nestfleet.dev`).**

**Owner-initiated plan changes** (FEAT-012 fleet console) are an administrative correction path — for handling edge cases, disputes, or manual migrations. Not the primary self-service path.

**Customer self-service path:** customer authenticates at `nestfleet.dev/account`, gets redirected to the Stripe Customer Portal. All plan changes, cancellations, and payment updates happen there. Stripe webhooks back to the main instance, which updates the provisioning record and triggers license reissue on the customer VPS via SSH (FEAT-012 reissue worker, already built).

---

## 2. Full lifecycle flows

### 2.1 Cancel (within trial or anytime)

```
Customer                    nestfleet.dev (main)         Stripe              Customer VPS
   │                               │                        │                      │
   │  1. Clicks link in email      │                        │                      │
   │  ───────────────────────────> │                        │                      │
   │  GET /account                 │                        │                      │
   │  (enters email)               │                        │                      │
   │  POST /api/v1/saas/account/   │                        │                      │
   │    magic-link                 │                        │                      │
   │  <─────────────────────────── │ sends magic link email │                      │
   │                               │                        │                      │
   │  2. Clicks magic link         │                        │                      │
   │  GET /account/verify?token=…  │                        │                      │
   │  ───────────────────────────> │                        │                      │
   │  <─────────────────────────── │  session cookie set    │                      │
   │  (sees account page:          │                        │                      │
   │   plan, status, trial end)    │                        │                      │
   │                               │                        │                      │
   │  3. Clicks "Manage →"         │                        │                      │
   │  POST /api/v1/saas/account/   │                        │                      │
   │    billing-portal             │                        │                      │
   │  ───────────────────────────> │  billingPortal.        │                      │
   │                               │  sessions.create()     │                      │
   │                               │ ────────────────────>  │                      │
   │                               │ <────────────────────  │                      │
   │  redirect to Stripe portal    │                        │                      │
   │  <─────────────────────────── │                        │                      │
   │                               │                        │                      │
   │  4. Cancels in Stripe         │                        │                      │
   │  ──────────────────────────────────────────────────>   │                      │
   │                               │                        │ subscription.deleted │
   │                               │ <────────────────────  │                      │
   │                               │  webhook               │                      │
   │                               │                        │                      │
   │                               │  startDeprovisioning() │                      │
   │                               │  (30-day grace period) │                      │
   │                               │                        │  VPS stays up 30d    │
   │                               │                        │ ───────────────────> │
   │                               │                        │                      │
   │                               │  sends "data export    │                      │
   │                               │  window" email         │                      │
   │                               │ ─────────────────────> customer email         │
```

### 2.2 Upgrade (Starter → Growth)

```
Customer                    nestfleet.dev (main)         Stripe              Customer VPS
   │                               │                        │                      │
   │  1–3. Same auth + portal      │                        │                      │
   │       flow as above           │                        │                      │
   │                               │                        │                      │
   │  4. Selects Growth plan       │                        │                      │
   │     in Stripe portal          │                        │                      │
   │  ──────────────────────────────────────────────────>   │                      │
   │                               │                        │ subscription.updated │
   │                               │ <────────────────────  │ (plan change)        │
   │                               │  webhook               │                      │
   │                               │                        │                      │
   │                               │  updateProvisioning()  │                      │
   │                               │  plan=growth           │                      │
   │                               │  license_tier=growth   │                      │
   │                               │  reissue_status=       │                      │
   │                               │    in_progress         │                      │
   │                               │                        │                      │
   │                               │  ReissueWorker picks   │                      │
   │                               │  up (polls every 30s)  │                      │
   │                               │  SSH → deploys new     │                      │
   │                               │  Growth license JWT    │ ───────────────────> │
   │                               │  reissue_status=idle   │   VPS tier = growth  │
   │                               │                        │   within ~60s        │
```

### 2.3 Downgrade (Growth → Starter, via Stripe portal)

Same as upgrade — `subscription.updated` fires, reissue worker deploys Starter JWT. Proration credit applied by Stripe automatically to next invoice.

---

## 3. Data requirements

### 3.1 Store Stripe IDs on provisioning row (G1 fix)

`provisionings` already has `stripe_customer_id` and `stripe_subscription_id` columns (defined in the type, never written). Fix: write them when `checkout.session.completed` fires for `saas_signup`.

**Change in `src/billing/webhook.ts`** — in the `saas_signup` branch, after enqueuing the provisioning job:
```typescript
// Store Stripe IDs on the provisioning row once it's created by the worker.
// The provisioning row doesn't exist yet at webhook time (worker creates it).
// Solution: store on signup_intent → worker copies to provisioning row at creation.
// OR: update provisioning row in webhook after slight delay (fragile).
// CORRECT approach: store stripe_customer_id on signup_intent row, worker reads it.
```

Actually, there's a sequencing problem: the provisioning row is created by the worker, which runs async after the webhook returns. The Stripe customer ID is available at webhook time but the provisioning row doesn't exist yet.

**Resolution:** Add `stripe_customer_id` and `stripe_subscription_id` to the `signup_intents` table. The webhook writes them there. The provisioning worker reads them from the intent and copies to the provisioning row when it creates it.

Migration needed: `0048_signup_intents_stripe_ids.sql`.

### 3.2 Customer sessions (stateless)

No new table. Sessions are **short-lived signed JWTs** issued by the magic link endpoint:

```
{
  sub: "customer:<email>",
  slug: "acme-corp",
  iat: <unix>,
  exp: <unix + 1h>,
  purpose: "account_session"
}
```

Signed with `config.JWT_SECRET` (same key used for operator JWTs, different `purpose` claim). 1-hour expiry. Magic link token itself is single-use (stored in memory map or Redis with TTL, invalidated on first use).

**Single-use token:** signed JWT with `exp: now + 15min`. On `/account/verify`, the token is validated and exchanged for a session JWT (1h). Since JWTs are stateless, "single-use" is enforced by a short expiry — if clicked twice within 15 minutes both work (acceptable for Phase 1). Phase 2 can use a nonce table if needed.

### 3.3 `customer.subscription.updated` webhook branch (G3 fix)

New branch in `webhook.ts` for `customer.subscription.updated` when `event_type === "saas_subscription"`:

```typescript
if (
  config.PROVISIONING_ENABLED &&
  (type === "customer.subscription.updated" || type === "customer.subscription.deleted") &&
  subMeta?.["event_type"] === "saas_subscription"
) {
  const slug = subMeta["slug"]
  const prov = await findProvisioningBySlug(slug)
  if (!prov) { logger.warn({ slug }, "subscription event: no provisioning found"); return }

  if (type === "customer.subscription.deleted") {
    // existing deprovisioning path — already implemented
  } else {
    // Plan change — trigger license reissue
    const newPlan = priceId ? priceIdToPlan(priceId)?.plan : null
    if (newPlan && newPlan !== prov.plan) {
      await updateProvisioning(prov.id, {
        plan:            newPlan,
        license_tier:    newPlan,
        reissue_status:  "in_progress",
        stripe_subscription_id: subId,
      })
      logger.info({ slug, oldPlan: prov.plan, newPlan }, "SaaS subscription plan change — license reissue queued")
    }
    // Also update subscription ID if changed (e.g. renewal creates new sub)
    await updateProvisioning(prov.id, { stripe_subscription_id: subId })
  }
  return  // do NOT fall through to workspace_billing upsert
}
```

---

## 4. API contracts (main instance only)

### POST /api/v1/saas/account/magic-link
**No auth required.** Rate-limited (3 req / email / 15min — prevent enumeration).

Request:
```json
{ "email": "user@example.com" }
```

Response (always 200 — never reveal whether email is known):
```json
{ "ok": true, "message": "If that email is registered, a link has been sent." }
```

Side effect: if email matches a `provisionings` row with status `active` or `deprovisioning`, send magic link email.

### GET /account/verify?token=…  (console page, not API)
Validates the JWT token. Sets `nestfleet_account_token` cookie (httpOnly, Secure, SameSite=Strict, 1h). Redirects to `/account`.

### GET /account  (console page)
Gated by `nestfleet_account_token` cookie. Shows:
- Plan, status (active / trialing / deprovisioning)
- Trial ends / next billing date
- Instance URL (`{slug}.nestfleet.dev`)
- "Manage subscription →" button

### POST /api/v1/saas/account/billing-portal
**Auth:** `nestfleet_account_token` cookie (validated as a session JWT).

Request:
```json
{ "return_url": "https://nestfleet.dev/account" }
```

Response:
```json
{ "ok": true, "portal_url": "https://billing.stripe.com/..." }
```

Looks up `provisionings` by email from session JWT. Uses `stripe_customer_id` to create portal session.

---

## 5. Console pages required (main instance)

| Path | Component | Notes |
|------|-----------|-------|
| `nestfleet.dev/account` | `AccountPage` | Plan status, manage button |
| `nestfleet.dev/account/verify` | `AccountVerify` | Token exchange, redirect to /account |

These live in `console/src/app/account/` on the main instance only. They render correctly on nestfleet.dev because the main instance has `PROVISIONING_ENABLED=true`. On community installs and customer VPSes these pages would also render but the API calls return 404 (PROVISIONING_ENABLED=false gate).

---

## 6. Welcome email update

Add after the login URL block:
```
Manage your subscription (cancel, upgrade, update billing):
  https://nestfleet.dev/account

Use the email address you registered with to log in.
```

---

## 7. Concerns and edge cases

### C1 — Trial cancellation: no grace period ✅ DECIDED
When a customer cancels during the 14-day free trial, `subscription.deleted` fires at trial end (Stripe cancels at period end by default when `cancel_at_period_end=true`). **No 30-day grace for trial cancellations.** The 30-day data export window applies only to paid subscriptions (customer has paid at least one invoice). Implementation: inspect `subscription.trial_end` and `subscription.status` in the webhook — if status was `trialing` at cancellation and no invoice was ever paid, set `deprovision_after = trial_end` (not `now() + 30 days`).

### C2 — Re-subscribe with same slug: short reactivation window ✅ DECIDED
After cancellation is received (deprovisioning status set), allow a **short reactivation window** (7 days) during which the customer can re-subscribe with the same slug. Once `deprovision_after` is reached and deprovisioning runs, slug is permanently retired — VPS deleted, data gone. Implementation: add `reactivation_deadline` column to `provisionings`; set to `now() + 7 days` at cancellation. If customer re-subscribes within 7 days, reset status to `active` and cancel deprovisioning. After 7 days, normal deprovisioning proceeds. Account page shows countdown.

### C3 — Email address change in Stripe: mirror via webhook ✅ BEST PRACTICE APPLIED
Handle `customer.updated` Stripe event: if `customer.email` changed, update `provisionings.customer_email` to match. This keeps magic link auth working after an email change. The customer would need to use their new email to request the magic link. No UI change needed — the magic link endpoint already looks up by email.

### C4 — Stripe Customer Portal must be configured by ops
Before the portal button works, ops must configure the Stripe Customer Portal in Stripe Dashboard → Settings → Billing → Customer Portal:
- ✅ Allow plan upgrades/downgrades (list Growth and Scale prices)
- ✅ Allow cancellation
- ✅ Allow payment method updates
- ✅ Set cancellation policy (cancel immediately vs end of period)
- **This is an ops task, not code.** Must be done before first paying customer.

### C5 — License reissue latency on upgrade
Between the Stripe plan change and the SSH license deploy (~30–60 seconds), the customer's VPS still shows the old tier. The VPS license endpoint (`GET /api/v1/license/tier`) will return the old tier during this window. Acceptable for Phase 1 — users won't notice a 60-second delay after an upgrade. The reissue worker already handles this transparently.

### C6 — Owner-initiated reissue vs customer self-service (consistency) ✅ DECIDED: FEAT-013 IS REQUIRED
FEAT-012 lets the owner change the tier via SSH without touching Stripe. FEAT-017-D makes Stripe the trigger for customer-initiated changes. **These must be consistent** — the goal is that Stripe is always the source of truth for billing, and the VPS license always reflects the Stripe subscription. Therefore FEAT-013 (owner reissue → Stripe sync) is **not optional** — without it, an owner-initiated tier change leaves Stripe billing the wrong amount. FEAT-013 priority raised from postponed to P1, to be implemented alongside FEAT-017. See FEAT-013 in backlog.

---

## 8. Sub-task breakdown

| ID | Title | Size | Dependency |
|----|-------|------|-----------|
| FEAT-017-A | Add `stripe_customer_id`/`stripe_subscription_id` to `signup_intents` table + write from webhook + copy to provisioning row at worker creation | XS | — |
| FEAT-017-B | Magic link auth: `POST /api/v1/saas/account/magic-link` + email send + `GET /account/verify` console page | S | FEAT-017-A |
| FEAT-017-C | Account page (`/account`) + `POST /api/v1/saas/account/billing-portal` | S | FEAT-017-B |
| FEAT-017-D | Extend `customer.subscription.updated` webhook to trigger license reissue for `saas_subscription` plan changes | S | FEAT-017-A |
| FEAT-017-E | Welcome email: add account management link | XS | FEAT-017-A |
| FEAT-017-F | Ops runbook: Stripe Customer Portal configuration checklist | XS | — (non-code) |

**Must-have for first paying customer:** A + B + C + E + F  
**Can follow within a sprint:** D (upgrade self-service)

---

## 9. What FEAT-013 covers (different scope, still postponed)

FEAT-013 is the **reverse direction**: owner changes tier in fleet console → Stripe subscription updated automatically. Not required for customer self-service. Remains postponed until owner demand.

FEAT-017-D covers: Stripe change → VPS license updated (customer-initiated).  
FEAT-013 covers: Owner console change → Stripe subscription updated (admin-initiated).

They are complementary, not overlapping.
