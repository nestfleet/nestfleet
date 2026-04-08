# FEAT-012: Owner Fleet — Reissue License

**Status:** draft
**Size:** L
**Priority:** P1
**Created:** 2026-04-08
**Depends on:** FEAT-001 (provisioning saga), NF-OPS-01 (Owner Console fleet UI)

---

## Problem Statement

NestFleet operates a managed self-hosted model where the Owner provisions customer VPSes and controls tier assignments. There is currently no in-product mechanism to change a customer's license tier after provisioning. Tier changes (upgrades, downgrades, renewals, corrections, emergency revocations) require the Owner to SSH manually into each VPS, regenerate the JWT, restart the API container, and verify the result — a multi-step error-prone process with no audit record. At 50+ clients this is operationally unsustainable. The Fleet page must be the single pane of glass for all license lifecycle events.

---

## User Stories

**US-1 — Upgrade**
As the NestFleet Owner, I want to upgrade a customer from Starter to Growth tier via the Fleet page so that the customer's instance immediately reflects the new capabilities without an SSH session.

**US-2 — Downgrade**
As the NestFleet Owner, I want to downgrade a customer from Growth to Starter (e.g., non-payment or cost-cutting request) with a clear warning about lost features, so that the change is deliberate and auditable.

**US-3 — Renewal**
As the NestFleet Owner, I want to extend a customer's license expiry at the same tier so that annual renewals do not require re-provisioning.

**US-4 — Correction**
As the NestFleet Owner, I want to correct a misconfigured tier (e.g., provisioned wrong tier) without deprovisioning and reprovisioning the VPS.

**US-5 — Emergency Revocation**
As the NestFleet Owner, I want to immediately set a non-paying customer to the Community tier so that they lose paid features while their VPS remains running.

**US-6 — SSH Failure Fallback**
As the NestFleet Owner, when a VPS is unreachable during a reissue, I want to download the pre-signed JWT so that I can apply the change manually or at a later time.

**US-7 — Bulk Renewal**
As the NestFleet Owner, I want to select multiple customers and renew all their licenses in one operation so that annual renewal season does not require N individual reissue dialogs.

---

## Acceptance Criteria

### Fleet Table

- [ ] AC-01: Fleet table displays a `Tier` badge column (Starter / Growth / Scale / Community) and an `Expires` column (date, amber if within 30 days, red if expired) for every row, always visible regardless of provisioning state.
- [ ] AC-02: The `Reissue License` row action is available for rows in `active` or `update_failed` provisioning status, and is disabled (with tooltip "Not available in current state") for rows in `provisioning`, `failed`, or `deprovisioned` states.
- [ ] AC-03: Fleet table supports multi-row checkbox selection. When one or more rows are selected, a `Renew Selected` bulk action button appears in the table header.

### Reissue Dialog

- [ ] AC-04: Clicking `Reissue License` opens a modal dialog showing: current tier, new tier dropdown (all valid tiers), expiry date picker (default: current expiry), reason text field (required, minimum 10 characters), and Submit / Cancel buttons.
- [ ] AC-05: Selecting a lower tier than the current tier displays a non-blocking warning panel within the dialog listing the features the customer will lose (derived from a static tier-capability map).
- [ ] AC-06: Submitting the dialog is disabled until the reason field meets the minimum length requirement.
- [ ] AC-07: The expiry date picker enforces a minimum of today's date (no backdating).

### Async Execution

- [ ] AC-08: After dialog submission, the dialog closes immediately and the fleet row shows an in-progress indicator (spinner badge replacing the tier badge) for the duration of the reissue operation.
- [ ] AC-09: On reissue success, a toast notification appears: "License reissued for {slug} — now on {new tier}". The fleet row tier badge and expiry date update to reflect the new values.
- [ ] AC-10: On reissue failure (SSH error, restart failure, or verification timeout), a toast notification appears: "Reissue failed for {slug}" with a "Download JWT" action button. The fleet row reverts to its previous tier badge (the DB-recorded value, not the in-flight new value).

### SSH Failure Path

- [ ] AC-11: When the SSH step fails, the system records the attempted reissue in the audit log with status `failed` and stores the pre-signed JWT in the DB row for manual download.
- [ ] AC-12: The "Download JWT" button (available from the failure toast and from the fleet row action menu after a failed reissue) downloads the pre-signed `.jwt` file to the Owner's browser.

### Verification

- [ ] AC-13: After writing the new JWT to the VPS and restarting the API container, the platform polls `GET /api/v1/license/status` on the customer VPS (using `LICENSE_SECRET` auth) until the response `tier` matches the new tier, with a 3-minute timeout and 15-second poll interval.
- [ ] AC-14: If the poll times out without a tier match, the reissue is marked `failed` and the Download JWT fallback is offered.

### Audit Trail

- [ ] AC-15: Every reissue attempt (successful or failed) is recorded in a `license_reissues` table with: `provisioning_id`, `performed_by` (owner user id), `previous_tier`, `new_tier`, `previous_expires_at`, `new_expires_at`, `reason`, `status` (`pending` / `complete` / `failed`), `failed_reason` (nullable), `created_at`, `completed_at`.
- [ ] AC-16: Each fleet row has an expandable `License History` panel showing the last 10 reissue records for that customer (timestamp, actor, previous tier → new tier, reason, status).

### Bulk Renewal

- [ ] AC-17: Clicking `Renew Selected` opens a confirmation dialog showing: selected customer count, new expiry date picker (applied uniformly to all), reason field (required), and Confirm / Cancel. Tier is unchanged for bulk renewal.
- [ ] AC-18: Bulk renewal queues one `license_reissue` pg-boss job per selected customer. Each job executes independently. Partial success is acceptable — failures surface individually via the toast/failure mechanism.
- [ ] AC-19: Bulk renewal is limited to a maximum of 50 customers per operation. If more than 50 are selected, the confirm dialog shows an error and the Submit button is disabled.

---

## Technical Design

### API Endpoints (Owner API — `src/api/v1/owner-fleet.ts`)

All endpoints require admin scope (`requireRole("admin")`). All inputs validated with Zod.

```
POST /api/v1/owner/fleet/:slug/reissue-license
  Body: {
    tier:      "community" | "starter" | "growth" | "scale"
    expiresAt: string   // ISO 8601 date
    reason:    string   // min 10 chars
  }
  Response: { ok: true, jobId: string }
  → Validates state, queues license_reissue pg-boss job, returns immediately

POST /api/v1/owner/fleet/reissue-license-bulk
  Body: {
    slugs:     string[]  // max 50
    expiresAt: string
    reason:    string
  }
  Response: { ok: true, queued: number, jobIds: string[] }

GET /api/v1/owner/fleet/:slug/license-history
  Response: { ok: true, history: LicenseReissueRecord[] }  // last 10, desc
  → Reads license_reissues table

GET /api/v1/owner/fleet/:slug/license-jwt-download
  Response: application/octet-stream (the raw JWT string as .jwt file)
  → Only returns a file if last reissue status = 'failed' and pending_jwt is set
  → Clears pending_jwt after download
```

### DB Schema — New Migration (`0055_license_reissues.sql`)

```sql
CREATE TABLE license_reissues (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  provisioning_id   UUID        NOT NULL REFERENCES provisionings(id),
  performed_by      TEXT        NOT NULL,   -- owner user identifier
  previous_tier     TEXT        NOT NULL,
  new_tier          TEXT        NOT NULL,
  previous_expires_at TIMESTAMPTZ NOT NULL,
  new_expires_at    TIMESTAMPTZ NOT NULL,
  reason            TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'complete', 'failed')),
  failed_reason     TEXT,
  pending_jwt       TEXT,                  -- set on failure for manual download
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX license_reissues_provisioning_id_idx
  ON license_reissues (provisioning_id, created_at DESC);
```

Additionally, alter `provisionings` to track current license state:

```sql
ALTER TABLE provisionings
  ADD COLUMN IF NOT EXISTS license_tier       TEXT,
  ADD COLUMN IF NOT EXISTS license_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reissue_status     TEXT NOT NULL DEFAULT 'idle'
                           CHECK (reissue_status IN ('idle', 'in_progress', 'failed'));
```

### License JWT Signing (`src/provisioning/license.ts`)

New or extended function:

```typescript
export function signLicense(opts: {
  orgSlug:    string
  tier:       LicenseTier
  expiresAt:  Date
  secret:     string        // OWNER_LICENSE_SECRET from env
}): string                  // signed JWT
```

The JWT payload mirrors the existing provisioning format. The `licenseSecret` per VPS (stored encrypted in `provisionings.secrets_enc`) is used to verify on the VPS side. The signing secret for reissue is the platform-level `OWNER_LICENSE_SECRET` env var (same key used at provisioning time).

### SSH Execution Strategy (`src/provisioning/ssh.ts` or new `src/fleet/ssh-exec.ts`)

Reuse or extend the existing SSH client established during provisioning.

Reissue SSH steps (executed in sequence, abort on first error):

1. `sftp.put(jwtBuffer, '/opt/nestfleet/license.jwt')` — overwrite the JWT file
2. `ssh.exec('docker compose -f /opt/nestfleet/docker-compose.prod.yml restart api')` — wait for exit code 0
3. Return success; caller polls `/api/v1/license/status`

SSH connection parameters: read from `provisionings.ssh_host`, `provisionings.ssh_port` (default 22), `provisionings.ssh_user`, platform SSH private key from `FLEET_SSH_PRIVATE_KEY` env var.

Timeout: 60 seconds for the combined SSH + restart step before marking SSH as failed.

### pg-boss Job (`src/workers/license-reissue-worker.ts`)

Job name: `license_reissue`

Payload:
```typescript
interface LicenseReissuePayload {
  reissueId:      string   // license_reissues.id
  provisioningId: string
  slug:           string
  newTier:        LicenseTier
  newExpiresAt:   string   // ISO 8601
}
```

Job steps:
1. Load provisioning row — verify `status = 'active'`; abort with `failed` if not
2. Sign new JWT (`signLicense`)
3. Store signed JWT in `license_reissues.pending_jwt` (for download fallback)
4. SSH to VPS: write JWT, restart API container
5. Poll `GET /api/v1/license/status` (15s interval, 12 attempts = 3 min max)
6. On tier match: update `provisionings.license_tier`, `license_expires_at`, `reissue_status = 'idle'`; update `license_reissues` with `status = 'complete'`, `completed_at`; clear `pending_jwt`
7. On SSH error or poll timeout: update `license_reissues.status = 'failed'`, `failed_reason`; update `provisionings.reissue_status = 'failed'`; retain `pending_jwt`

Job config: `retryLimit: 0` (operator decides on retry), `expireInSeconds: 300` (5 min).
Failure handler: update DB to `failed`, emit structured log with `reissueId` and `slug`.

### VPS License Status Endpoint

The customer VPS must expose (or already expose via existing license guard):

```
GET /api/v1/license/status
Authorization: Bearer <LICENSE_SECRET>

Response: { tier: string, expiresAt: string, valid: boolean }
```

If this endpoint does not yet exist on customer VPSes, it must be added to `src/api/v1/license.ts` in the API image (released via OPS-FLEET-02 update, or included in next image build). This is a soft dependency — the verification poll step gracefully handles 404 as an unresolvable failure.

---

## UX Flow

### Single Reissue — Happy Path

```
Fleet table row: [acme] [Growth] [Expires 2026-12-31] [...actions]
  → Owner clicks "Reissue License"

Dialog opens:
  Current tier:  Growth
  New tier:      [Growth ▾]         ← dropdown, defaults to current
  Expiry:        [2027-12-31]       ← date picker, defaults to current
  Reason:        [_____________________________]  ← required
  [Cancel]  [Reissue License]

Owner selects tier=Growth, extends expiry, types reason, clicks Reissue:
  → Dialog closes
  → Fleet row: [acme] [⟳ Reissuing...] [...]

~30 seconds later:
  → Toast: "License reissued for acme — now on Growth (exp 2027-12-31)"
  → Fleet row: [acme] [Growth] [Expires 2027-12-31] [...]
```

### Downgrade Warning

```
Owner selects tier=Starter (was Growth):
  → Warning panel appears inline in dialog:
    "Downgrading to Starter will remove access to:
     • Multi-product support
     • Growth-tier AI features
     • [...]"
  → Reissue button remains enabled; Owner must consciously proceed
```

### SSH Failure Path

```
~60 seconds later (SSH timeout):
  → Toast: "Reissue failed for acme — SSH unreachable"
           [Download JWT]
  → Fleet row: [acme] [Growth] [⚠ Reissue failed] [...]
  → Row action menu includes: "Download Failed JWT" option

Owner clicks Download JWT:
  → Browser downloads: acme-license-2026-04-08.jwt
  → Owner SFTPs file manually or applies during next maintenance window
```

### Bulk Renewal

```
Owner checks 12 rows → "Renew Selected (12)" button appears
  → Confirmation dialog:
    Renewing 12 customers — same tier, new expiry
    New expiry: [2027-04-08]
    Reason: [_____________________________]
    [Cancel]  [Renew 12 Licenses]

  → 12 jobs queued; each row shows ⟳ spinner independently
  → Toasts fire as each job completes (or fails)
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Reissue triggered while another reissue is `in_progress` for same slug | API returns 409 Conflict with message "Reissue already in progress" |
| VPS `provisioning` or `deprovisioned` state | Reissue action disabled in UI; API validates and returns 422 if attempted directly |
| SSH succeeds but API restart fails (non-zero exit) | SSH step returns error; marked `failed`; JWT available for download |
| API restarts and reads new JWT but returns wrong tier | Treated as poll timeout → `failed` after 3 min |
| `expiresAt` in the past | Zod validation rejects on API; date picker enforces min=today in UI |
| Bulk reissue: one job fails out of 12 | Remaining 11 continue independently; failure toast only for the failed slug |
| `license_reissues.pending_jwt` not cleared after manual download | Download endpoint clears on first successful GET; idempotent second GET returns 404 |
| Owner license secret rotation | Re-provisioning or a separate key-rotation flow is out of scope; current secret is used |

---

## Out of Scope

- Client-initiated tier change or upgrade requests (future self-serve flow)
- Stripe webhook-triggered automatic reissue (future — see business context)
- Email notification to the customer when their tier changes
- License secret rotation per VPS
- Rollback of a reissue to the previous tier (Owner reruns reissue dialog with old tier)
- UI for the customer to view their own license tier (customer console — separate feature)
- `GET /api/v1/license/status` implementation on the customer VPS if not yet present (soft dependency tracked separately; spec assumes it exists or will be delivered with next image release)

---

## Test Requirements

### Unit Tests (`npm test`)

- `signLicense` — correct JWT payload, tier, expiry, signature verification
- `license-reissue-worker` — mock SSH client and HTTP poll; assert all state transitions (happy path, SSH failure, poll timeout)
- Owner API endpoints — Zod validation rejection, 409 on concurrent reissue, 422 on wrong provisioning state, 404 for missing slug

### Integration Tests (`npm run test:integration`)

- `POST /api/v1/owner/fleet/:slug/reissue-license` — seeds DB, calls endpoint, asserts job queued and `license_reissues` row created with `pending` status
- `GET /api/v1/owner/fleet/:slug/license-history` — seeds 5 reissue records, asserts correct shape and ordering
- `GET /api/v1/owner/fleet/:slug/license-jwt-download` — asserts file returned when `failed` + `pending_jwt` set; asserts 404 after first download clears the field
- Bulk endpoint — asserts N jobs queued for N slugs; asserts 422 when slugs > 50

### E2E / Console Tests (Playwright)

- Reissue dialog opens, downgrade warning appears on tier drop, submit disabled until reason filled, dialog closes on submit
- Fleet row spinner visible during in-progress state; tier badge updates after success
- Bulk renewal confirmation dialog shown with correct count; cancel works

---

## Definition of Done

- [ ] Migration `0055` applied cleanly; `license_reissues` table and `provisionings` new columns exist
- [ ] `POST /owner/fleet/:slug/reissue-license` queues pg-boss job and returns `jobId`
- [ ] `license-reissue-worker` executes all 7 job steps and handles all failure modes
- [ ] JWT download endpoint returns file and clears `pending_jwt` on first call
- [ ] Fleet table shows Tier badge and Expires columns with correct colour states
- [ ] Reissue dialog enforces all validation rules including downgrade warning
- [ ] License history panel shows last 10 records per fleet row
- [ ] Bulk renewal queues N jobs and enforces 50-row cap
- [ ] All unit, integration, and E2E tests pass (`npm test`, `npm run test:integration`)
- [ ] `tsc --noEmit` reports 0 errors
- [ ] `CLAUDE.md` documentation sync: no new env vars introduced beyond `OWNER_LICENSE_SECRET` (already used at provisioning); if `FLEET_SSH_PRIVATE_KEY` is renamed or added, `.env.example` updated
