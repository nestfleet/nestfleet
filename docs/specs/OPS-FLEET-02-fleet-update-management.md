# OPS-FLEET-02 — Fleet Update Management

> **Status:** Spec — not started  
> **Size:** L  
> **Priority:** P1  
> **Depends on:** FEAT-001 (provisioning saga), OPS-IMAGE-01 (GHCR images)

---

## Problem

Once a customer VPS is provisioned it never receives application updates. Every push to main
publishes new `nestfleet-api:latest` and `nestfleet-console:latest` images to GHCR, but existing
instances have no mechanism to pull them. A fleet of 20+ instances means 20+ stale installs after
every release.

Requirements (in priority order):
1. **Control** — operator decides when and which instances update; nothing updates automatically
2. **Per-instance granularity** — push one instance, a subset, or all; observe each result
3. **Rollback** — revert any individual instance to its previous image SHA on demand
4. **Visibility** — current version and update status visible in Owner Console fleet table
5. **Recovery** — failed updates leave instance running the old version; no half-updated state
6. **Speed** — a fleet of 20 updates in ≤ 10 minutes with default concurrency of 5

---

## Architecture

### Why not Watchtower

Watchtower (option 1) polls GHCR and restarts containers automatically. It is incompatible with
requirement 1 (control) and requirement 3 (rollback). It has no coordination, no success
confirmation, and no way to stop mid-fleet. It is excluded from this design.

### Overview

```
Owner Console ──► pg-boss fleet_update_instance job
                        │
                        ▼
              POST /api/v1/system/update  (customer VPS)
                        │
                        ▼
              docker compose pull + up -d --no-deps api console
                        │
                        ▼
              GET /api/v1/system/version  (poll until SHA matches or timeout)
                        │
                        ▼
              UPDATE provisionings SET current_api_sha, update_status
```

All coordination lives in the `provisionings` table. The customer VPS exposes two lightweight
system endpoints. The pg-boss job handles one VPS at a time; a fleet-wide update queues N jobs
with configurable concurrency.

---

## Components

### 1. Image Tagging (GHCR — already partially done)

`docker-publish.yml` already publishes:
- `ghcr.io/nestfleet/nestfleet-api:latest` — overwritten on every push
- `ghcr.io/nestfleet/nestfleet-api:sha-XXXXXXX` — immutable, retained indefinitely

The SHA tag is the rollback anchor. `:latest` is used only for initial VPS provisioning.

**No change needed to the CI pipeline.** SHA tags are already being pushed.

The current deployed SHA per instance is discovered via `GET /api/v1/system/version` on the
customer VPS (see below).

### 2. Database — `provisionings` table additions

New migration `0050_fleet_update.sql`:

```sql
ALTER TABLE provisionings
  ADD COLUMN current_image_sha     TEXT,          -- confirmed running SHA (e.g. "sha-a1b2c3d")
  ADD COLUMN previous_image_sha    TEXT,          -- SHA before last update (rollback target)
  ADD COLUMN target_image_sha      TEXT,          -- SHA being pushed right now
  ADD COLUMN update_status         TEXT NOT NULL DEFAULT 'idle'
                                   CHECK (update_status IN
                                     ('idle','updating','update_complete','update_failed')),
  ADD COLUMN last_updated_at       TIMESTAMPTZ;
```

### 3. Customer VPS — Two new system endpoints

Both endpoints are gated by `LICENSE_SECRET` passed as `Authorization: Bearer <LICENSE_SECRET>`.
The platform already knows each instance's `LICENSE_SECRET` — it is stored encrypted in
`provisionings.secrets_enc`.

#### `POST /api/v1/system/update`

```
Authorization: Bearer <LICENSE_SECRET>
Content-Type:  application/json

{ "tag": "sha-a1b2c3d" }     ← omit for latest
```

Behaviour:
1. Validate `LICENSE_SECRET` from env
2. Run in background (no blocking):
   ```sh
   docker compose -f /opt/nestfleet/docker-compose.prod.yml pull api console
   docker compose -f /opt/nestfleet/docker-compose.prod.yml up -d --no-deps api console
   ```
3. Return immediately: `{ ok: true, status: "update_started" }`

The platform confirms success by polling `/system/version`. Running containers are never stopped
before the new image is pulled — Docker Compose handles the cutover atomically per service.

#### `GET /api/v1/system/version`

```
Authorization: Bearer <LICENSE_SECRET>
```

Returns current running image digests via `docker inspect`:

```json
{
  "ok": true,
  "api":     { "sha": "sha-a1b2c3d", "digest": "sha256:abcd..." },
  "console": { "sha": "sha-a1b2c3d", "digest": "sha256:efgh..." }
}
```

Both endpoints are added to `src/api/v1/system.ts` (new file), mounted under `/api/v1`.
`REGISTRATION_ENABLED` guard does not apply — these are platform-internal endpoints.

### 4. Platform — `fleet_update_instance` pg-boss job

New file: `src/workers/fleet-update-worker.ts`

Job payload:
```typescript
interface FleetUpdatePayload {
  provisioningId: string
  targetSha:      string      // "sha-a1b2c3d" | "latest"
  isRollback:     boolean
}
```

Job steps:
1. Load provisioning row — read `secrets_enc` → decrypt → get `LICENSE_SECRET`
2. `POST /api/v1/system/update` on `https://{slug}.{baseDomain}` with target SHA
3. Poll `GET /api/v1/system/version` every 30s, up to 10 min (20 attempts)
4. On SHA match: update DB (`current_image_sha`, `previous_image_sha`, `update_status = update_complete`)
5. On timeout / HTTP error: update DB (`update_status = update_failed`), send ops alert
6. Instance keeps running old version on any failure — no rollback needed for a failed update

Job config: `retryLimit: 0` (intentional — don't auto-retry; operator decides via Owner Console),
`expireInSeconds: 660` (11 min, slightly above poll window).

### 5. Fleet-wide update trigger

New function: `src/provisioning/fleet-update.ts`

```typescript
export async function queueFleetUpdate(opts: {
  provisioningIds?: string[]   // subset; omit for all active
  targetSha:        string
  concurrency?:     number     // default: 5
}): Promise<{ queued: number }>
```

- Queries all `status = 'active'` provisionings if no IDs given
- Sets `update_status = 'updating'`, `target_image_sha = targetSha` on all targets
- Inserts `fleet_update_instance` jobs into pg-boss

Concurrency is enforced by pg-boss `teamSize` on the job handler (not in the trigger function).

### 6. Owner Console — Fleet table additions

**New columns in fleet table:**
- `Version` — shows `current_image_sha` (7-char short form), grey if null, link to GHCR tag
- `Update` — status badge: `idle` (grey) / `updating` (amber pulse) / `done` (green) / `failed` (red)

**Per-row actions** (extend `FleetRowActions`):
- `Update` button — opens dialog: "Update {slug} to latest?" with SHA preview → confirms → calls `POST /api/v1/owner/fleet/{slug}/update`
- `Rollback` button — visible only when `previous_image_sha` is set and `update_status != 'updating'` → dialog: "Roll back {slug} to {previous_sha}?" → calls same endpoint with `{ sha: previous_sha, rollback: true }`

**Fleet page header:**
- `Update All` button → confirmation dialog showing count of active instances and target SHA → calls `POST /api/v1/owner/fleet/update-all`

**Auto-refresh:** SWR key changes on `update_status = 'updating'` — poll every 5s until all
instances exit `updating` state.

### 7. Owner API — new endpoints

`src/api/v1/owner-fleet.ts` additions:

```
POST /api/v1/owner/fleet/:slug/update
  Body: { sha?: string }         ← omit for latest
  → queues fleet_update_instance for this slug

POST /api/v1/owner/fleet/update-all
  Body: { sha?: string, concurrency?: number }
  → queues fleet_update_instance for all active instances

POST /api/v1/owner/fleet/:slug/rollback
  → queues fleet_update_instance with previous_image_sha as target
  → 409 if previous_image_sha is null
```

All endpoints: admin scope required (`requireRole("admin")`).

### 8. Emergency CLI script (ops fallback)

`scripts/fleet-update-cli.ts` — standalone script with the same logic as the pg-boss job.
Reads DB directly, loops over active provisionings, runs updates sequentially.
Used when the owner console is unavailable or for scripted mass recovery.

```sh
npx tsx scripts/fleet-update-cli.ts --sha sha-a1b2c3d --slug myslug
npx tsx scripts/fleet-update-cli.ts --sha sha-a1b2c3d --all --concurrency 3
npx tsx scripts/fleet-update-cli.ts --rollback --slug myslug
```

---

## Update Flow (happy path, single instance)

```
Operator clicks "Update" for slug "acme"
  → POST /api/v1/owner/fleet/acme/update
  → provisionings: update_status = updating, target_image_sha = sha-a1b2c3d
  → pg-boss queues fleet_update_instance{provisioningId, targetSha: sha-a1b2c3d}

Worker picks up job:
  → POST https://acme.nestfleet.dev/api/v1/system/update {tag: sha-a1b2c3d}
  → VPS: docker compose pull api console (pulls sha-a1b2c3d)
  → VPS: docker compose up -d --no-deps api console (zero-downtime restart)
  → Worker polls GET /system/version every 30s

  Attempt 1 (t+0s):  SHA still old → keep polling
  Attempt 2 (t+30s): SHA = sha-a1b2c3d → match

  → provisionings: previous_image_sha = old, current_image_sha = sha-a1b2c3d,
                   update_status = update_complete, last_updated_at = now

Fleet table auto-refreshes → "done" badge, new SHA visible
```

## Rollback Flow

```
Operator clicks "Rollback" for slug "acme"
  → POST /api/v1/owner/fleet/acme/rollback
  → reads previous_image_sha = sha-x9y8z7w
  → queues fleet_update_instance{targetSha: sha-x9y8z7w, isRollback: true}

Worker: same steps as update but with old SHA
  → On complete: current_image_sha = sha-x9y8z7w (no previous_image_sha update on rollback)
```

---

## Failure Modes

| Scenario | Outcome |
|----------|---------|
| VPS unreachable (POST fails) | `update_failed`, ops alert, VPS still on old version |
| Pull fails (GHCR down) | Docker exits non-zero, VPS still on old version, `update_failed` |
| Compose up fails (crash loop) | Docker restarts old containers, version poll times out → `update_failed` |
| Version poll timeout (10 min) | `update_failed`, VPS may be mid-restart — ops SSHes to investigate |
| Rollback target SHA not in GHCR | Pull fails → same as above |
| DB write fails after success | Version confirmed, DB may show stale status — idempotent retry safe |

In all failure cases the customer VPS remains reachable on its previous version.

---

## What is NOT in scope

- **Automated / scheduled updates** — operator-driven only (Watchtower excluded by design)
- **Canary / blue-green per customer** — single container per service; in-place update only
- **Semantic versioning UI** — SHA labels only; version names are a future enhancement
- **Customer notification on update** — silent update; ops alert on failure only
- **Self-update of the update endpoint** — the system endpoints are part of the API image;
  a failed API update may break the endpoint; SSH fallback (script) covers this edge case

---

## Acceptance Criteria

- [ ] Migration `0050` adds 5 new columns to `provisionings`
- [ ] `GET /api/v1/system/version` returns current image SHA on customer VPS
- [ ] `POST /api/v1/system/update` triggers pull + up and returns immediately
- [ ] Both system endpoints reject requests with wrong `LICENSE_SECRET` → 401
- [ ] `fleet_update_instance` job confirms SHA match within 10 min on happy path
- [ ] `fleet_update_instance` marks `update_failed` and sends ops alert on timeout
- [ ] Instance remains reachable on old version after any failure mode
- [ ] Rollback endpoint returns 409 when `previous_image_sha` is null
- [ ] Owner console fleet table shows `Version` and `Update` columns
- [ ] Per-row `Update` and `Rollback` buttons functional with confirmation dialogs
- [ ] `Update All` with concurrency=5 updates 20 instances in ≤ 10 min
- [ ] CLI script `fleet-update-cli.ts` works for single slug and `--all`
- [ ] Unit tests for `fleet_update_instance` job (mock VPS endpoints)
- [ ] Unit tests for system endpoints (LICENSE_SECRET validation, docker exec mock)

---

## Implementation Order

1. Migration `0050`
2. System endpoints on customer VPS (`src/api/v1/system.ts`)
3. `fleet_update_instance` pg-boss job + worker registration
4. `fleet-update.ts` trigger function
5. Owner API endpoints (`/update`, `/rollback`, `/update-all`)
6. Owner Console UI (columns + buttons)
7. CLI script
8. Tests
