# FEAT-018 — Open-Core Fleet Separation

> **Status:** Spec complete, not started  
> **Priority:** P2 (before public repo flip — no external pressure yet)  
> **Size:** M  
> **Depends on:** FEAT-017 (subscription lifecycle — ✅ in progress)

---

## 1. Problem Statement

NestFleet ships one codebase to three deployment targets (community self-hosted, main SaaS VPS, customer VPS). The fleet management capability — provisioning customer VPSes on Hetzner, managing DNS via Cloudflare, issuing license JWTs, handling Stripe webhooks for SaaS subscriptions — is the core commercial moat.

Once the repo goes public, any developer can clone it, set `PROVISIONING_ENABLED=true`, supply their own Hetzner + Cloudflare + Stripe credentials, and run an identical managed SaaS platform for free. The technical and legal barrier to this must be in place before the public repo flip.

This spec defines:
1. A **directory boundary** — fleet code moves to `src/fleet/` with a distinct commercial license.
2. A **cryptographic operator key** (`NESTFLEET_OPERATOR_KEY`) — fleet features cannot be activated without a JWT signed by NestFleet's private key.
3. A **`LICENSE-FLEET.md`** file — legal notice placed on fleet code; placeholder now, formalised when legal entity is registered.

---

## 2. Architecture Decision

### 2.1 What the community gets (unchanged)

Everything outside `src/fleet/` remains AGPL-3.0. Community users get:
- AI triage pipeline
- Case management, lineage graph, operator inbox
- Channel integrations (email, Telegram, GitHub, contact form, external webhook)
- Knowledge base / RAG
- Full Hono API + Next.js console
- Unlimited self-hosting

### 2.2 What fleet code is

`src/fleet/` contains:
- VPS provisioning (Hetzner, Cloudflare DNS, cloud-init)
- Deprovisioning scheduler
- Fleet health worker
- License reissue worker
- Owner fleet console API
- SaaS signup API
- Fleet-specific Stripe webhook paths

**Copying this directory and supplying your own API keys is technically possible but commercially prohibited by `LICENSE-FLEET.md`.**

### 2.3 Cryptographic gate — `NESTFLEET_OPERATOR_KEY`

A JWT signed by NestFleet's private key (Ed25519), verified at API startup against a hardcoded public key embedded in `src/fleet/operator-key.ts`. Without a valid key:

- `PROVISIONING_ENABLED=true` in env is silently ignored.
- All fleet API routes (`/api/v1/saas/*`, `/api/v1/owner/*`) return 503.
- No fleet workers start.

**This is the real technical barrier.** Anyone can read the code; no one can run it as a competing SaaS fleet without a key issued by NestFleet. The legal notice amplifies this — it creates a cause of action if someone bypasses the key.

### 2.4 What the key does NOT block

- Community installs (no fleet code involved).
- Running the full monolith on a single machine without `PROVISIONING_ENABLED=true`.
- Development/testing with `NODE_ENV=test` (key validation skipped in test env).

---

## 3. File Move Manifest

### 3.1 `src/provisioning/` → `src/fleet/provisioning/`

| Old path | New path |
|----------|----------|
| `src/provisioning/cloud-init.ts` | `src/fleet/provisioning/cloud-init.ts` |
| `src/provisioning/cloudflare-client.ts` | `src/fleet/provisioning/cloudflare-client.ts` |
| `src/provisioning/deprovision.ts` | `src/fleet/provisioning/deprovision.ts` |
| `src/provisioning/health-poller.ts` | `src/fleet/provisioning/health-poller.ts` |
| `src/provisioning/hetzner-client.ts` | `src/fleet/provisioning/hetzner-client.ts` |
| `src/provisioning/provision.ts` | `src/fleet/provisioning/provision.ts` |
| `src/provisioning/slug.ts` | `src/fleet/provisioning/slug.ts` |

### 3.2 `src/api/v1/` fleet routes

| Old path | New path |
|----------|----------|
| `src/api/v1/owner.ts` | `src/fleet/api/owner.ts` |
| `src/api/v1/saas.ts` | `src/fleet/api/saas.ts` |

These are mounted in `src/api/index.ts`. The mount point stays unchanged (`/api/v1/owner`, `/api/v1/saas`). The import path changes.

### 3.3 Billing webhook fleet paths

`src/billing/webhook.ts` currently handles both community billing (workspace billing upsert) and fleet billing (saas_signup, saas_subscription). The fleet paths are extracted:

| Before | After |
|--------|-------|
| fleet paths inline in `src/billing/webhook.ts` | extracted to `src/fleet/billing/webhook-fleet.ts` |
| `handleStripeEvent()` calls both | `handleStripeEvent()` imports `handleFleetStripeEvent()` from fleet module; calls it for fleet event types |

**Community billing path (`workspace_billing`) stays in `src/billing/webhook.ts`.** The split is clean: if `event_type === "saas_signup"` or `event_type === "saas_subscription"` → fleet handler; otherwise → community handler.

### 3.4 Workers

| Old path | New path |
|----------|----------|
| `src/workers/provisioning-worker.ts` | `src/fleet/workers/provisioning-worker.ts` |
| `src/workers/deprovision-scheduler.ts` | `src/fleet/workers/deprovision-scheduler.ts` |
| `src/workers/fleet-health-worker.ts` | `src/fleet/workers/fleet-health-worker.ts` |
| `src/workers/license-reissue-worker.ts` | `src/fleet/workers/license-reissue-worker.ts` |

Worker registration in `src/index.ts` (or wherever workers start) updates import paths.

### 3.5 What stays in community code

| File | Why |
|------|-----|
| `src/infra/db/repositories/provisionings.ts` | Pure DB access layer — no business logic, no Hetzner/CF calls. Community code may reference provisioning state for display-only purposes. |
| `src/infra/db/migrations/` | All migrations (including fleet tables) stay here — shared infra. |
| `src/shared/config.ts` | Config is shared. `PROVISIONING_ENABLED` check stays; fleet gate adds the key check on top. |

---

## 4. `NESTFLEET_OPERATOR_KEY` — Cryptographic Gate

### 4.1 Key structure

The operator key is a JWT signed with NestFleet's **Ed25519 private key**:

```json
{
  "iss": "nestfleet.dev",
  "sub": "operator:nestfleet",
  "purpose": "fleet_operator",
  "iat": <unix>,
  "exp": <unix + 1 year>
}
```

Issued by NestFleet (owner). One key for the main VPS. Customer VPSes never receive this key (they have `PROVISIONING_ENABLED=false`).

### 4.2 Verification — `src/fleet/operator-key.ts`

```typescript
// SPDX-License-Identifier: LicenseRef-NestFleet-Fleet-1.0
// Copyright (c) NestFleet — all rights reserved. See LICENSE-FLEET.md.

import { jwtVerify, importSPKI } from "jose"

// NestFleet Ed25519 public key — hardcoded, not configurable.
// Changing this key requires a new binary release signed by NestFleet.
const NESTFLEET_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
...
-----END PUBLIC KEY-----`

let _verified = false

export async function verifyOperatorKey(keyJwt: string): Promise<void> {
  const key = await importSPKI(NESTFLEET_PUBLIC_KEY_PEM, "EdDSA")
  await jwtVerify(keyJwt, key, {
    issuer:  "nestfleet.dev",
    audience: "fleet_operator",
  })
  _verified = true
}

export function isFleetOperatorAuthorized(): boolean {
  return _verified
}
```

### 4.3 Startup sequence (in `src/index.ts`)

```typescript
if (config.PROVISIONING_ENABLED) {
  if (process.env.NODE_ENV !== "test") {
    const key = config.NESTFLEET_OPERATOR_KEY
    if (!key) {
      logger.error("PROVISIONING_ENABLED=true but NESTFLEET_OPERATOR_KEY not set — fleet features disabled")
    } else {
      try {
        await verifyOperatorKey(key)
        logger.info("Fleet operator key verified — fleet features active")
      } catch (err) {
        logger.error({ err }, "NESTFLEET_OPERATOR_KEY invalid — fleet features disabled")
      }
    }
  }
  if (isFleetOperatorAuthorized() || process.env.NODE_ENV === "test") {
    startFleetWorkers()
    mountFleetRoutes(app)
  }
}
```

### 4.4 New env var

| Var | Required | Notes |
|-----|----------|-------|
| `NESTFLEET_OPERATOR_KEY` | Yes, when `PROVISIONING_ENABLED=true` in prod | JWT string. Not present in community or customer VPS compose files. Added to `docker-compose.prod.yml` only. |

---

## 5. `LICENSE-FLEET.md`

Placed at repo root, referenced from file headers in `src/fleet/`.

### 5.1 Content (placeholder — formalize with legal entity)

```markdown
# NestFleet Fleet License — LicenseRef-NestFleet-Fleet-1.0

Copyright (c) NestFleet — All rights reserved.

The files in `src/fleet/` constitute the NestFleet Fleet Management Module
("Fleet Module"). The Fleet Module is NOT licensed under AGPL-3.0.

**You may:**
- Read, audit, and study the Fleet Module source code.
- Run the Fleet Module solely for the purpose of operating the NestFleet
  managed SaaS service at nestfleet.dev, under a valid `NESTFLEET_OPERATOR_KEY`
  issued by NestFleet.

**You may NOT, without a separate written commercial license from NestFleet:**
- Use the Fleet Module to operate a competing managed SaaS service.
- Deploy the Fleet Module to provision, manage, or license instances for
  third parties (whether for fee or free).
- Remove, bypass, or replace the `NESTFLEET_OPERATOR_KEY` verification.
- Sublicense, sell, or transfer the Fleet Module to any third party.

Violation of this license terminates your rights under AGPL-3.0 for the
entire NestFleet repository.

To obtain a commercial license: contact@nestfleet.dev
```

### 5.2 File header template for all `src/fleet/**/*.ts` files

```typescript
// SPDX-License-Identifier: LicenseRef-NestFleet-Fleet-1.0
// Copyright (c) NestFleet — all rights reserved. See LICENSE-FLEET.md.
```

Added at the top of each file in `src/fleet/`. Existing files being moved get the header added at move time.

---

## 6. `src/fleet/` Directory Structure (target state)

```
src/fleet/
├── LICENSE-FLEET.md          ← symlink or copy to repo root
├── operator-key.ts            ← Ed25519 public key + verifyOperatorKey()
├── api/
│   ├── owner.ts               ← /api/v1/owner routes
│   └── saas.ts                ← /api/v1/saas routes
├── billing/
│   └── webhook-fleet.ts       ← fleet Stripe event handlers
├── provisioning/
│   ├── cloud-init.ts
│   ├── cloudflare-client.ts
│   ├── deprovision.ts
│   ├── health-poller.ts
│   ├── hetzner-client.ts
│   ├── provision.ts
│   └── slug.ts
└── workers/
    ├── provisioning-worker.ts
    ├── deprovision-scheduler.ts
    ├── fleet-health-worker.ts
    └── license-reissue-worker.ts
```

---

## 7. Import Path Updates

All files that import from the old paths need updating. No functional changes — only `import` paths change.

| Import site | Old import | New import |
|-------------|-----------|-----------|
| `src/api/index.ts` | `./v1/owner.js` | `../fleet/api/owner.js` |
| `src/api/index.ts` | `./v1/saas.js` | `../fleet/api/saas.js` |
| `src/api/webhooks/stripe.ts` | `../../billing/webhook.js` | unchanged (community handler still there; fleet handler called from within it) |
| `src/billing/webhook.ts` | fleet paths (inline) | `../fleet/billing/webhook-fleet.js` |
| `src/index.ts` | `./workers/provisioning-worker.js` etc. | `./fleet/workers/provisioning-worker.js` etc. |
| `src/workers/provisioning-worker.ts` | `../provisioning/provision.js` etc. | `../fleet/provisioning/provision.js` etc. (**only after move**) |

---

## 8. README Update

Add a section to `README.md` explaining the open-core model:

```markdown
## Open-Core Model

NestFleet is open-core:

- **Core** (`src/` except `src/fleet/`) — AGPL-3.0. Fully open. Self-host freely.
- **Fleet Module** (`src/fleet/`) — Commercial. Enables the managed SaaS platform
  (automated VPS provisioning, fleet health, subscription lifecycle). Requires a
  `NESTFLEET_OPERATOR_KEY` issued by NestFleet. See `LICENSE-FLEET.md`.

Community self-hosters use only the AGPL core. The Fleet Module is never activated
without an operator key — it is inert code in community builds.
```

---

## 9. Concerns and Edge Cases

### C1 — Test suite: operator key in test env

Integration tests that test fleet routes (provisioning saga, saas-signup) rely on `PROVISIONING_ENABLED=true` in the config mock. They must not require a real operator key.

**Resolution:** Key verification is skipped when `process.env.NODE_ENV === "test"`. Fleet workers and routes are activated in test env as long as `PROVISIONING_ENABLED=true`. No test changes needed.

### C2 — `license-reissue-worker.ts` dual dependency

The license reissue worker uses SSH (fleet capability) but is triggered by a DB poll on the `provisionings` table (fleet-specific). It has no community use case.

**Resolution:** Moves to `src/fleet/workers/` cleanly. No dual-dependency issue.

### C3 — `src/infra/db/repositories/provisionings.ts` stays in community

The provisioning repository (`findProvisioningBySlug`, `updateProvisioning`, etc.) is imported by fleet workers but is pure SQL. It lives in community code because: (a) the DB schema is shared infra, (b) community builds don't break if the file exists, (c) keeping it in community code does not expose any fleet functionality.

Any future reference to provisioning data from community code (e.g., display) would not require moving this file.

### C4 — Key generation tooling

The NestFleet Ed25519 keypair must be generated by the owner and stored securely. The private key is never committed. The public key is hardcoded in `src/fleet/operator-key.ts`. A one-time script `scripts/generate-operator-keypair.ts` generates the pair and prints the public key in PEM format for embedding.

This is an ops task, not a code task, but the script must be created alongside the feature.

### C5 — Does this block going public?

No. `LICENSE-FLEET.md` is a legal notice, not a technical blocker on GitHub. The repo can go public with `LICENSE-FLEET.md` in place. The cryptographic key is the real barrier. Legal enforcement is strengthened when a legal entity is registered — but the key protection works immediately.

### C6 — Key rotation

When the operator key expires (1-year TTL), the main VPS must be restarted with a new key or the key reloaded without restart. For Phase 1: accept the restart requirement. Phase 2: add a `POST /api/v1/fleet/operator-key/rotate` endpoint (authenticated as owner) that verifies and hot-swaps the key without restart.

---

## 10. Sub-Task Breakdown

| ID | Title | Size | Dependency |
|----|-------|------|-----------|
| FEAT-018-A | Generate Ed25519 keypair; embed public key in `src/fleet/operator-key.ts`; create `scripts/generate-operator-keypair.ts`; add `NESTFLEET_OPERATOR_KEY` to `docker-compose.prod.yml` env block | XS | — |
| FEAT-018-B | Create `src/fleet/` directory structure; move all 7 `src/provisioning/` files; add `LICENSE-FLEET.md` file headers; update all internal imports within moved files | S | FEAT-018-A |
| FEAT-018-C | Move `src/api/v1/owner.ts` → `src/fleet/api/owner.ts`; move `src/api/v1/saas.ts` → `src/fleet/api/saas.ts`; update `src/api/index.ts` imports | XS | FEAT-018-B |
| FEAT-018-D | Extract fleet Stripe webhook paths from `src/billing/webhook.ts` → `src/fleet/billing/webhook-fleet.ts`; add delegation call in community webhook | XS | FEAT-018-B |
| FEAT-018-E | Move 4 fleet workers to `src/fleet/workers/`; update `src/index.ts` registration; wrap worker startup in `isFleetOperatorAuthorized()` gate | XS | FEAT-018-B |
| FEAT-018-F | Startup gate: `verifyOperatorKey()` in `src/index.ts`; `isFleetOperatorAuthorized()` guard on route mount and worker start; skip in `NODE_ENV=test` | S | FEAT-018-A, FEAT-018-C, FEAT-018-E |
| FEAT-018-G | Create `LICENSE-FLEET.md`; add file header to all `src/fleet/**/*.ts`; update `README.md` open-core section | XS | FEAT-018-B |
| FEAT-018-H | Run full test suite (unit + integration + type check); fix any broken imports | XS | all above |

**Must-have before public repo flip:** all 8 sub-tasks.  
**Order:** A → B → C + D + E (parallel) → F → G → H.
