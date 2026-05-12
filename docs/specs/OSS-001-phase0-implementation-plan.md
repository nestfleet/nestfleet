# OSS-001 Phase 0a–0d — Implementation Plan

**Created:** 2026-05-11
**Scope:** All critical, high, and medium-easy fixes required before making the repo public.
**Approach:** TDD — write tests first (red), then implement (green). Each item includes side-effect analysis.

---

## Sequencing (execute in this order)

```
1.  C1  — crypto.ts + config.ts: rename ENCRYPTION_KEY → SECRET_ENCRYPTION_KEY
2.  C1  — Update all test mocks referencing ENCRYPTION_KEY (atomic with step 1)
3.  C2  — .env.example: keygen comment fix (openssl rand -hex 32)
4.  C4  — Fail-closed cron endpoints: config.ts production guard + route handlers
5.  C5  — Email webhook auth: config.ts + webhooks/email.ts + integration test updates
6.  C6  — Fleet route gate: api/index.ts
7.  C3  — npm audit fix (both packages) + verify test suite passes
8.  C7  — git rm PII files + git filter-repo (rewrites history — no going back)
9.  H1  — git rm tmp_test_triage.ts
10. H2  — docker-compose.yml postgres password guard
11. H3/H4 — SPDX headers (scripted, ~141 files)
12. H7  — README JWT localStorage security note
13. H8  — git mv scripts/ingest-docugardener.ts → scripts/ingest-docs.ts
14. H9  — scripts/seed-admin.ts: env-ify password
15. H10 — LICENSES.md: full regeneration
16. M1/M2 — Remove hardcoded Colima socket paths
17. INST-01 — Fix EMBEDDING_PROVIDER enum (add "google")
18. INST-02..07 — .env.example + README documentation fixes
19. M6  — LICENSE-FLEET.md: add warranty disclaimer
20. M7  — README: add Glossary / "Outcome Unit" definition
21. M8  — Verify no console.warn in src/fleet/ (no-op if already clean)
```

Steps 1–2 must be committed atomically. Steps 4, 5, 6 should each be a separate commit for clean rollback.

---

## Phase 0a — Critical Fixes

---

### C1 — Encryption key naming unification + fail-hard semantics

**Problem:**
- `src/shared/crypto.ts:22` reads `process.env.ENCRYPTION_KEY` directly (bypasses Zod config).
- `src/shared/config.ts:109` validates `ENCRYPTION_KEY`, but `.env.example` and README use `SECRET_ENCRYPTION_KEY`.
- `encryptSecret()` silently stores plaintext when key is absent — no warning.
- `src/fleet/provisioning/cloud-init.ts:122` writes `ENCRYPTION_KEY=...` into customer VPS `.env`.

**Decision:** Rename canonical env var to `SECRET_ENCRYPTION_KEY` everywhere in code. Keep `ENCRYPTION_KEY` as deprecated alias with a console.warn (remove in v0.2.0) so existing deployments don't hard-break.

#### TDD — write these tests FIRST

New file: `tests/unit/shared/crypto.test.ts`

```typescript
// C1-T01: throws in production when SECRET_ENCRYPTION_KEY and ENCRYPTION_KEY are both unset
// C1-T02: throws when key is present but not 64 hex chars
// C1-T03: round-trips plaintext correctly when key is valid 64-char hex
// C1-T04: decryptSecret throws with helpful message when key absent and value starts with enc:
// C1-T05: accepts SECRET_ENCRYPTION_KEY (primary name)
// C1-T06: emits deprecation warn when only ENCRYPTION_KEY is set (not SECRET_ENCRYPTION_KEY)
```

Use `vi.stubEnv()` / `vi.restoreAllMocks()` to isolate `process.env` per test.

Also add to `tests/unit/shared/config.test.ts`:
```typescript
// C1-T07: production parseConfig() throws when SECRET_ENCRYPTION_KEY is absent
```

#### Implementation

1. **`src/shared/crypto.ts`** — replace `resolveKey()`:
   ```typescript
   function resolveKey(): string | null {
     const primary = process.env.SECRET_ENCRYPTION_KEY
     if (primary) return primary
     const legacy = process.env.ENCRYPTION_KEY
     if (legacy) {
       console.warn("[DEPRECATED] Use SECRET_ENCRYPTION_KEY instead of ENCRYPTION_KEY. Will be removed in v0.2.0.")
       return legacy
     }
     if (process.env.NODE_ENV === "production") {
       throw new Error("SECRET_ENCRYPTION_KEY must be set in production. Generate: openssl rand -hex 32")
     }
     return null
   }
   ```
   Replace `encryptSecret()` silent fallback: throw `Error("SECRET_ENCRYPTION_KEY is required to encrypt secrets.")` when key is null.

2. **`src/shared/config.ts`** — rename field `ENCRYPTION_KEY` → `SECRET_ENCRYPTION_KEY`. Add production guard in `parseConfig()`:
   ```typescript
   if (result.data.NODE_ENV === "production" && !result.data.SECRET_ENCRYPTION_KEY) {
     throw new Error("SECRET_ENCRYPTION_KEY must be set in production (SEC-02).")
   }
   ```

3. **`src/fleet/provisioning/cloud-init.ts:122`** — change `ENCRYPTION_KEY=` → `SECRET_ENCRYPTION_KEY=`.

#### Side effects

13 test mock files set `ENCRYPTION_KEY: "a".repeat(64)` — all must be renamed to `SECRET_ENCRYPTION_KEY`:
- `tests/unit/api/internal-endpoints.test.ts:27`
- `tests/unit/api/security-txt.test.ts:12`
- `tests/unit/api/owner-revenue.test.ts:24`
- `tests/unit/api/login-rate-limit.test.ts:15`
- `tests/unit/api/owner-new-customer.test.ts:24`
- `tests/unit/telemetry/telemetry-ping.test.ts:18`
- `tests/unit/workers/license-reissue-worker.test.ts:42`
- `tests/unit/fleet/saas-account.test.ts:19`
- `tests/integration/owner-reissue.test.ts:43`
- `tests/unit/provisioning/cloud-init.test.ts:82` — assert `SECRET_ENCRYPTION_KEY=` in generated VPS YAML

---

### C2 — .env.example keygen comment

**No TDD required — documentation only.**

`.env.example` lines 141–145: change `openssl rand -base64 32` → `openssl rand -hex 32` (the Zod regex expects 64 hex chars, not base64). Rename `SECRET_ENCRYPTION_KEY=` to match C1 rename.

---

### C3 — npm audit vulnerabilities

**Implementation:**
```bash
npm audit fix           # root package
cd console && npm audit fix   # console package
```

If `console/` requires `--force` for any fix, run `npm audit fix --dry-run` first and inspect breaking changes before committing.

After both fixes:
- `npm run build` — must pass
- `npm test` — must pass
- `npm run test:integration` — must pass

**Side effects:** Hono version bump may change cache middleware behaviour. Check integration tests for response caching assumptions. The `protobufjs` fix (transitive via OTel) is unlikely to affect behaviour.

**No new tests needed** — existing suite is the regression net.

---

### C4 — SEC-A1 fail-open fix (internal cron endpoints)

**Problem:** Current guard pattern in `src/api/v1/cases.ts:801` and `src/api/v1/notifications.ts:133`:
```typescript
const secret = config.INTERNAL_CRON_SECRET
if (secret) {
  const header = c.req.header("X-Internal-Secret")
  if (header !== secret) return c.json({ error: "UNAUTHORIZED" }, 401)
}
// when secret is unset → falls through, all traffic accepted
```

#### TDD — write these tests FIRST

Update `tests/unit/api/internal-endpoints.test.ts`:

```typescript
// C4-T01: NODE_ENV=production, INTERNAL_CRON_SECRET unset → startup throws at parseConfig()
// C4-T02: NODE_ENV=production, secret set, header absent → 401
// Update NF-UNIT-INT-07: secret unset in test env → endpoint still rejects (fail-closed)
```

#### Implementation

1. **`src/shared/config.ts`** — add in `parseConfig()`:
   ```typescript
   if (result.data.NODE_ENV === "production" && !result.data.INTERNAL_CRON_SECRET) {
     throw new Error(
       "INTERNAL_CRON_SECRET must be set in production. " +
       "Generate: node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\""
     )
   }
   ```

2. **`src/api/v1/cases.ts:800–805`** and **`src/api/v1/notifications.ts:130–137`** — replace guard:
   ```typescript
   const secret = config.INTERNAL_CRON_SECRET
   const provided = c.req.header("X-Internal-Secret")
   if (!secret || provided !== secret) return c.json({ error: "UNAUTHORIZED" }, 401)
   ```

#### Side effects

- Existing test `NF-UNIT-INT-07` asserts `status !== 401` when secret absent — now incorrect. Update it.
- Cron jobs calling these endpoints must add `X-Internal-Secret: $INTERNAL_CRON_SECRET` header. Document in README ops section (replace `docs/ops-troubleshooting.md` content that is being moved to private ops repo — add a brief note in self-hosting guide instead).

---

### C5 — Email webhook: add HMAC authentication

**Problem:** `src/api/webhooks/email.ts` — `POST /webhooks/email/inbound/:productId` has no auth. Anyone with a productId can inject fake email signals.

#### TDD — write these tests FIRST

New file: `tests/unit/api/email-webhook-auth.test.ts`

```typescript
// C5-T01: missing X-Webhook-Secret header → 401
// C5-T02: wrong X-Webhook-Secret value → 401
// C5-T03: correct X-Webhook-Secret → proceeds (200 or downstream error, not 401)
// C5-T04: EMAIL_WEBHOOK_SECRET not configured → 401 (fail-closed)
```

Mock `config.EMAIL_WEBHOOK_SECRET`, `parsePostmarkInbound`, and `ingestEmailSignal`.

Also update `tests/integration/pipeline.test.ts`: all POST calls to `/webhooks/email/inbound/:productId` must add `"X-Webhook-Secret": process.env.EMAIL_WEBHOOK_SECRET ?? "test-email-secret"`.

#### Implementation

1. **`src/shared/config.ts`** — add to schema:
   ```typescript
   EMAIL_WEBHOOK_SECRET: z.string().min(16).optional(),
   ```
   Add production guard:
   ```typescript
   if (result.data.NODE_ENV === "production" && !result.data.EMAIL_WEBHOOK_SECRET) {
     throw new Error("EMAIL_WEBHOOK_SECRET must be set in production (C5)")
   }
   ```

2. **`src/api/webhooks/email.ts`** — add at top of handler (before body parsing, after ~line 23):
   ```typescript
   const secret = config.EMAIL_WEBHOOK_SECRET
   const provided = c.req.header("X-Webhook-Secret")
   if (!secret || provided !== secret) {
     return c.json({ error: "Unauthorized" }, 401)
   }
   ```

3. **`.env.example`** — add after `GITHUB_WEBHOOK_SECRET`:
   ```
   # Email inbound webhook secret — must match the value set in Postmark/Resend webhook headers
   # Generate: openssl rand -hex 32
   EMAIL_WEBHOOK_SECRET=
   ```

4. **`vitest.integration.config.ts`** — add `EMAIL_WEBHOOK_SECRET: "test-integration-email-secret-32chars"` to the `env` block.

#### Side effects

- `tests/integration/pipeline.test.ts`: ~8 POST calls to email inbound endpoint need the header.
- **Breaking change for operators**: existing Postmark/Resend webhook configs must add `X-Webhook-Secret` header. Document in CHANGELOG.md.

---

### C6 — Fleet routes mounted unconditionally

**Problem:** `src/api/index.ts:230–233` mounts `saasRouter`, `saasAccountRouter`, `ownerRouter` regardless of operator key. Community self-hosters see 401/403 instead of 404.

#### TDD — write these tests FIRST

New file: `tests/unit/api/fleet-gate.test.ts`

```typescript
// C6-T01: GET /api/v1/saas/* → 404 when isFleetOperatorAuthorized() returns false
// C6-T02: GET /api/v1/saas/account/* → 404 when not authorized
// C6-T03: GET /api/v1/owner/* → 404 when not authorized
// C6-T04: fleet routes respond (non-404) when isFleetOperatorAuthorized() returns true
```

Mock `../../../src/fleet/operator-key.js` to control `isFleetOperatorAuthorized()`.

#### Implementation

`src/api/index.ts` lines 230–233. Replace unconditional mounts:
```typescript
if (isFleetOperatorAuthorized() || config.NODE_ENV === "test") {
  app.route("/api/v1/saas",         saasRouter)
  app.route("/api/v1/saas/account", saasAccountRouter)
  app.route("/api/v1/owner",        ownerRouter)
}
app.route("/api/v1/waitlist", waitlistRouter)  // public — keep unconditional
```

#### Side effects

- `NODE_ENV === "test"` escape hatch preserves existing integration tests (`saas-signup.test.ts`, `owner-reissue.test.ts`, `owner-revenue.test.ts`) without needing a valid operator key.
- Community self-hosters: behaviour change from 401/403 → 404 on fleet routes. Intentional.

---

### C7 — Scrub PII/prod data from committed files

**Git history analysis:** All three files were in the initial commit (`50a2c94`). `git filter-repo` is required — not just a HEAD deletion.

#### Implementation

Step 1 — Delete from working tree:
```bash
git rm docs/archive/competitor-revenue-research.md
git rm docs/business/beta-evaluation-scenarios.md
git rm docs/ops-troubleshooting.md
```

Step 2 — Add to `.gitignore`:
```
docs/business/beta-evaluation-scenarios.md
docs/ops-troubleshooting.md
docs/archive/competitor-revenue-research.md
```

Step 3 — Rewrite history (destructive — do this last in the phase, after all other C-items are committed):
```bash
pip install git-filter-repo
git filter-repo \
  --path docs/archive/competitor-revenue-research.md \
  --path docs/business/beta-evaluation-scenarios.md \
  --path docs/ops-troubleshooting.md \
  --invert-paths \
  --force
git push --force origin main   # after owner confirmation
```

#### Side effects

- All commit SHAs rewritten. External forks/clones diverge — acceptable since repo is still private.
- Internal file references to the deleted files must be cleaned up:
  - `docs/business/beta-eval-run-plan.md:3`
  - `docs/business/pre-launch-audit.md:44,105,163`
  - `docs/business/nestfleet-docugardener-client-sdlc.md:642`
  - `scripts/beta-eval/inject-signals.ts:781`

**No TDD — filesystem operation.**

---

## Phase 0b — High Fixes

---

### H1 — Delete tmp_test_triage.ts

```bash
git rm tmp_test_triage.ts
```

`.gitignore` already has `tmp_*/` pattern — no change needed. Verify with `grep -rn "tmp_test_triage"` returns nothing outside the file itself.

---

### H2 — Default postgres password in docker-compose.yml

**Implementation:**

`docker-compose.yml`:
- `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-nestfleet}` → `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required — see .env.example}`
- `DATABASE_URL: postgres://nestfleet:${POSTGRES_PASSWORD:-nestfleet}@...` → use `:?` syntax

**Side effects:**
- `docker compose up` without `.env` now errors. Intentional.
- `README.md`: add note that `.env` must be created from `.env.example` before running compose.
- CI pipeline: verify no job runs `docker compose up` without setting `POSTGRES_PASSWORD`.

---

### H3/H4 — SPDX license headers (scripted)

**Current state:** ~27 of 168 `src/*.ts` files have headers. Fleet module uses `LicenseRef-NestFleet-Commercial`.

**Script to run (not to commit):**

```bash
# AGPL files (all src/**/*.ts EXCEPT src/fleet/)
find src -name "*.ts" -not -path "*/fleet/*" | while read f; do
  grep -q "SPDX" "$f" || \
  sed -i '' "1s|^|// SPDX-License-Identifier: AGPL-3.0-or-later\n// Copyright (C) 2024-2026 NestFleet contributors\n\n|" "$f"
done

# Fleet module (commercial)
find src/fleet -name "*.ts" | while read f; do
  grep -q "SPDX" "$f" || \
  sed -i '' "1s|^|// SPDX-License-Identifier: LicenseRef-NestFleet-Commercial\n// Copyright (C) 2024-2026 NestFleet. All rights reserved.\n\n|" "$f"
done
```

After running, verify with `npm run lint` (TypeScript compile) — no errors expected. Headers before `import` statements are valid TS.

**Side effects:** Line numbers in any test assertions shift by 3. Verify no tests assert source-file line numbers.

---

### H7-OD4 — JWT localStorage security note

Add to `README.md` in a "Security Notes" section:

```markdown
## Security Notes

**v0.1.x — JWT stored in localStorage:** The operator console stores the session JWT
in `localStorage`. This is acceptable for an internal/self-hosted tool, but the token
is accessible to any JavaScript running on the same origin. v0.2.0 will migrate to
`httpOnly` cookies. If you serve the console alongside third-party scripts, add a
strict `Content-Security-Policy` header.
```

---

### H8 — Rename ingest-docugardener.ts

```bash
git mv scripts/ingest-docugardener.ts scripts/ingest-docs.ts
```

Update:
- `package.json:17`: `"spike:ingest": "tsx scripts/ingest-docs.ts"`
- Internal log messages in `scripts/ingest-docs.ts`: `"ingest-docugardener"` → `"ingest-docs"`
- Any README / CONTRIBUTING references to the old filename.

---

### H9 — Env-ify seed admin password

#### TDD — write test FIRST

New file: `tests/unit/scripts/seed-admin.test.ts`

```typescript
// H9-T01: resolveSeedPassword() throws in production when SEED_ADMIN_PASSWORD unset
// H9-T02: resolveSeedPassword() returns env var value when set
// H9-T03: resolveSeedPassword() returns dev default when unset and NODE_ENV=development
```

Extract `resolveSeedPassword()` as a named export from `scripts/seed-admin.ts` for testability.

#### Implementation

`scripts/seed-admin.ts`:
```typescript
export function resolveSeedPassword(): string {
  const pwd = process.env.SEED_ADMIN_PASSWORD
  if (!pwd && process.env.NODE_ENV === "production") {
    throw new Error(
      "SEED_ADMIN_PASSWORD must be set in production.\n" +
      "Generate: SEED_ADMIN_PASSWORD=$(openssl rand -base64 24) tsx scripts/seed-admin.ts"
    )
  }
  return pwd ?? "nestfleet-admin-2025"
}
```

`.env.example`: add `SEED_ADMIN_PASSWORD=` with keygen comment.

E2E specs: update hardcoded `nestfleet-admin-2025` references to `process.env.SEED_ADMIN_PASSWORD ?? "nestfleet-admin-2025"`.

---

### H10 — Regenerate LICENSES.md

```bash
npx license-checker --production --csv --out LICENSES.md  # root
cd console && npx license-checker --production --csv >> ../LICENSES.md
```

Verify all Apache-2.0, MPL-2.0, BSD entries have: package name, version, author, license text URL.

---

### M1/M2 — Remove hardcoded Colima socket paths

**`package.json:15`**: Remove `DOCKER_HOST=unix:///Users/Alexey_Kopachev/...` prefix from `test:integration` script. Let `DOCKER_HOST` come from the developer's shell environment.

**`vitest.integration.config.ts:21`**: Change fallback from local Colima path to standard socket:
```typescript
DOCKER_HOST: process.env.DOCKER_HOST ?? "unix:///var/run/docker.sock",
```

`CONTRIBUTING.md`: add setup instructions for Colima users:
```bash
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

---

## Phase 0c — Installation UX Fixes

---

### INST-01 — Fix EMBEDDING_PROVIDER enum

**Problem:** `src/shared/config.ts:61` has `z.enum(["openai", "ollama"])`. Setting `EMBEDDING_PROVIDER=google` crashes the server at startup.

#### TDD — write test FIRST

Add to `tests/unit/shared/config.test.ts`:
```typescript
// INST01-T01: accepts "google" as EMBEDDING_PROVIDER
// INST01-T02: rejects unknown provider "vertex"  
// INST01-T03: "openai" and "ollama" still accepted
```

Add to `tests/unit/memory/embedder.test.ts` (new or existing):
```typescript
// INST01-T04: embedBatch routes EMBEDDING_PROVIDER=google to openAI path (OpenAI-compat endpoint)
```

#### Implementation

`src/shared/config.ts:61`:
```typescript
EMBEDDING_PROVIDER: z.enum(["openai", "ollama", "google"]).default("openai"),
```

`src/memory/ingestion/embedder.ts`:
- Update `EmbeddingConfig.provider` type: add `"google"`
- Add dispatch branch for `"google"` → `embedOpenAI` (uses OpenAI-compat Gemini endpoint):
  ```typescript
  } else if (cfg.provider === "google") {
    results.push(...await embedOpenAI(batch, cfg))
  }
  ```

`.env.example:50`: update comment `# Supported: openai | ollama` → `# Supported: openai | ollama | google`

**Side effects:** `EmbeddingConfig.provider` type change is internal. No external callers of this type.

---

### INST-02 through INST-07 — .env.example + README docs

Pure documentation — no TDD required.

| ID | File | Change |
|----|------|--------|
| INST-02 | `.env.example` | Comment out `OTEL_EXPORTER_OTLP_ENDPOINT` with note: `# Leave empty to disable tracing (uses noop exporter)` |
| INST-03 | `.env.example` | Add comment to `LICENSE_FILE_PATH`: `# Community mode: leave unset — all features enabled, no license file needed` |
| INST-04 | `.env.example` | `DATABASE_URL` comment: add `# Production: append ?sslmode=require` |
| INST-05 | `README.md` | Add note: OpenAI API key required for embeddings even if using Anthropic for LLM (two separate providers) |
| INST-06 | `README.md` | Fix key command consistency: use `openssl rand -hex 32` for all secret generation examples |
| INST-07 | `.env.example` | Mark all optional vars explicitly with `# Optional:` prefix where not already done |

---

## Phase 0d — Medium Easy

---

### M6 — LICENSE-FLEET.md warranty disclaimer

Append to `LICENSE-FLEET.md`:
```markdown
## Disclaimer of Warranty

THE FLEET MODULE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL NESTFLEET OR ITS
CONTRIBUTORS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH
THE FLEET MODULE OR THE USE OR OTHER DEALINGS IN THE FLEET MODULE.
```

---

### M7 — README Glossary: "Outcome Unit"

Add to `README.md`:
```markdown
## Glossary

**Outcome Unit (OU):** The primary billing and rate-limiting unit in NestFleet.
One OU is consumed when NestFleet autonomously closes or escalates a support case
using AI. Cases manually resolved or left open do not consume an OU. Community tier
installs default to 200 OUs/month (`COMMUNITY_OU_LIMIT`); set to `0` for unlimited.
```

---

### M8 — console.warn in src/fleet/

Verify with `grep -rn "console\.warn" src/fleet/`. If any found, replace with `logger.warn({ ...data }, "message")`.
Likely no-op (fleet module already uses pino logger throughout).

---

## New + Updated Test Files Summary

| File | Status | Covers |
|------|--------|--------|
| `tests/unit/shared/crypto.test.ts` | **NEW** | C1 — all encrypt/decrypt guard cases |
| `tests/unit/api/email-webhook-auth.test.ts` | **NEW** | C5 — email webhook 401/403 |
| `tests/unit/api/fleet-gate.test.ts` | **NEW** | C6 — fleet routes 404 without operator key |
| `tests/unit/scripts/seed-admin.test.ts` | **NEW** | H9 — seed password guard |
| `tests/unit/shared/config.test.ts` | **UPDATE** | C1-T07, C4-T01, INST01-T01..T03 |
| `tests/unit/api/internal-endpoints.test.ts` | **UPDATE** | C4 — NF-UNIT-INT-07 + C4-T02 |
| `tests/integration/pipeline.test.ts` | **UPDATE** | C5 — add X-Webhook-Secret to ~8 calls |
| `vitest.integration.config.ts` | **UPDATE** | C5 — add EMAIL_WEBHOOK_SECRET env var |
| `tests/unit/provisioning/cloud-init.test.ts:82` | **UPDATE** | C1 — assert SECRET_ENCRYPTION_KEY in VPS YAML |
| 9 other test mocks with `ENCRYPTION_KEY` | **UPDATE** | C1 — rename to SECRET_ENCRYPTION_KEY |
