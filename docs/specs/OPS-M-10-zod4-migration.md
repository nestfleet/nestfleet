# OPS-M-10 — zod 3 → 4 migration

> **Status:** Spec — not started
> **Size:** M (re-estimated from L after measurement, see "Evidence")
> **Priority:** P1 — **hard deadline 2026-12-31** (audit-gate exception expires; CI turns red on purpose)
> **Depends on:** nothing. **Unblocks:** removal of the OPS-M-09 audit exception, the held AI SDK upgrade (ai ≥7.0.169).
> **Evidence measured:** 2026-11-17, zod 4.6.7 installed into an unmodified copy of `main` @ `9da07ab`.

---

## 1. Why this exists

zod 3.25.76 carries GHSA-mrhx-c7xc-m3w5 (high): validating a large array of bad elements builds one
issue object per element, so a single request can allocate tens of MB. There is **no zod 3 fix**.
OPS-M-09 (#353) added a time-boxed audit exception plus request body limits as a stop-gap; it
expires **2026-12-31**.

### What happened before (why this has a reputation)

Dependabot proposed zod 4 three times — #264 (4.6.2), #278 (4.6.5), #317 (4.6.6). Each was closed
unmerged because zod sits on every critical path at once:

- **Boot** — `src/shared/config.ts` parses all env vars through zod; a bad parse = no product.
- **Every API route** — request bodies and query strings are validated with zod.
- **Every AI agent** — 6 agent output schemas and 11 tool input schemas are zod; the AI SDK turns
  them into the JSON Schema each LLM provider receives.

The backlog estimate (55 files, 61 `.default()` sites, 31 strict-format sites, "provider wire
schemas **will** change") was a static reading of the changelog — never measured. This spec replaces
it with measurements.

---

## 2. Evidence — what actually breaks (measured)

| Area | Feared | Measured on unmodified `main` + zod 4.6.7 | Risk |
|---|---|---|---|
| Type-check | 55 files | **72 errors in 16 files.** 51 are one mechanical pattern (`z.record(x)` → `z.record(z.string(), x)`). | Low |
| Unit tests | — | **1604 / 1605 pass.** 1 failure: `config.test.ts` NF-UNIT-CFG-01 (`TELEMETRY_ENABLED`, see §3.1). | Low |
| Integration tests (API + Postgres) | — | **Fail set identical to `main`** (same 10 known baseline failures, 0 new, 0 fixed). | Low |
| AI provider schemas (6 agents + 11 tools) | "will change" | **All 17 byte-identical** zod 3 vs zod 4 through `asSchema(zodSchema(...)).jsonSchema` (verified the zod 4 run used real zod 4 instances). LLMs receive exactly the same instructions. | Low |
| Startup config (boot path) | 22 defaults at risk | Differential parse of real `config.ts`: **1 key differs** — `TELEMETRY_ENABLED` when unset (§3.1). With vars set explicitly: 0 differences. | Low (dormant) |
| Strict formats (`email` 21, `url` 8, `datetime` 3, `uuid` **0**) | stricter → users locked out | 40 tricky inputs (apostrophes, `+tags`, IDN, IPs, `postgres://`, `http://ollama:11434`, offsets, …): **0 accept/reject differences.** | None |
| `.default()` short-circuit (61 sites) | silent wrong values | Only 4 sites put `.default()` after `transform/pipe/preprocess`; **1 changes behaviour** (`TELEMETRY_ENABLED`). The 5 object/array defaults are plain `[]`/`{}` — unaffected. | Low |
| Error responses | console breaks | Console never reads zod issue details. API 400 `details` text changes wording only; `.flatten()` / `.issues` still exist. | Cosmetic |
| Removed APIs (`required_error`, `invalid_type_error`, `errorMap`, `z.function`) | — | **0 uses.** | None |
| Deprecated but working (`message:` 67, `.strict()/.passthrough()` 11, `.flatten()` 6) | — | Compile and behave the same. Optional follow-up cleanup, **not** part of this item. | None |
| Latest AI SDK (held today) | — | zod 4 + ai 7.0.173 / provider-utils 5.0.81: **0 additional errors**; the 16 lookup-tool `limit` errors disappear. | Unblocked |

**Conclusion:** the migration is a contained M-size change, not a product-wide rewrite. The real
product-wide risk lives in §3.2 (doing it wrong), not in zod 4 itself.

---

## 3. The traps — read before implementing

### 3.1 `.default()` no longer runs through `.transform()` (the one real behaviour change)

```ts
// src/shared/config.ts:121
TELEMETRY_ENABLED: z.string().transform((v) => v === "true").default("false"),
```

zod 3 transforms the default → `false` (boolean). zod 4 returns the default **as-is** → `"false"`
(string, truthy). **Current impact: none** — `TELEMETRY_ENABLED` is not read anywhere; the real
switch is `TELEMETRY_OPT_IN` (`src/index.ts:109`, `boolEnv`, unaffected). It is still fixed here
because it is a compile error under zod 4 and a trap for whoever wires the flag later.

**Rule for every future schema:** in zod 4 the `.default()` value must already be the *output* type.
Write `boolEnv.default(false)`, not `.transform(...).default("false")`.

### 3.2 ⚠️ False fix: `import { z } from "zod/v3"` clears the alert but NOT the vulnerability

zod 4 ships its old v3 engine at `zod/v3`. A codemod `"zod" → "zod/v3"` compiles with near-zero
changes **and turns `npm audit` + Dependabot green, because they only check the package version.**
Measured with 200,000 bad elements in `z.array(z.string()).max(10)`:

| Engine | Issues built | Heap | Time |
|---|---|---|---|
| zod 3.25.76 (today) | 200,001 | +65 MB | 171 ms |
| zod 4.6.7 via `zod/v3` | 200,001 | +67 MB | 127 ms |
| **zod 4.6.7 via `zod`** | **1** | **+0 MB** | **3 ms** |

**`zod/v3` is forbidden in this migration.** Acceptance check: `grep -rn "zod/v3" src` returns nothing.

### 3.3 The fix only protects arrays that declare `.max()`

zod 4.6.6+ rejects an oversized array **before** validating elements — but only when the schema has
a length cap. An uncapped `z.array(...)` still builds one issue per bad element (measured: 200,000
issues on zod 4 too). So upgrading alone does not close the attack surface.

Request-facing arrays without a cap (must get `.max(n)`):

| File | Line | Field |
|---|---|---|
| `src/api/v1/users.ts` | 82, 83 | `CreateUserBodySchema.roles`, `.productIds` |
| `src/api/v1/users.ts` | 89, 90 | `UpdateUserBodySchema.roles`, `.productIds` |
| `src/api/v1/knowledge-assets.ts` | 42 | `sourceRefs` |
| `src/api/v1/notification-prefs.ts` | 30 | `email_disabled_events` |
| `src/email/parser.ts` | 34, 36 | Postmark `Headers`, `Attachments` (inbound webhook — unauthenticated external input, highest priority) |

Pick limits from real data (e.g. roles ≤ 20, sourceRefs ≤ 100, Postmark headers ≤ 200). The 27
internal arrays (agent outputs, DB-row parsing) are not attacker-sized and are out of scope.
Body limits from OPS-M-09 stay as defence in depth.

---

## 4. Implementation plan

One PR, branch `ops/OPS-M-10-zod4`. Root `package.json` only (console has no direct zod dependency;
its transitive dev-only zod 4.4.3 gets a lockfile refresh in the same PR).

| Step | Change | Files | Notes |
|---|---|---|---|
| 1 | `zod ^4.6.7` | `package.json`, lockfile | regenerate with Node 22.23.4 / npm 10.9 (CI parity) |
| 2 | `z.record(x)` → `z.record(z.string(), x)` | ~10 repositories + 3 routes (51 sites) | mechanical |
| 3 | Normaliser return types: `z.ZodType<number, z.ZodTypeDef, number>` → `z.ZodType<number>` (and `number[]`) | `src/agents/output-normalisation.ts` | fixes 8 errors here + 12 knock-on `unknown` errors in `triage.ts`, `auto-reply-worker.ts`, `frontline-worker.ts`, `steward-worker.ts` |
| 4 | `TELEMETRY_ENABLED: boolEnv.default(false)` | `src/shared/config.ts` | §3.1; keep accepting `"true"` |
| 5 | Add `.max(n)` to the 8 request-facing arrays | 4 files | §3.3 |
| 6 | Remove the zod entry from `.github/audit-allowlist.json` | 1 file | gate must pass with no exception |
| 7 | Tests (below) | `tests/` | |
| 8 | Docs: backlog row, OPS-M-09 note, README/CONTRIBUTING if zod idioms are documented | docs | |

**Explicitly out of scope:** renaming `message:` → `error:`, `.strict()` → `z.strictObject()`, the AI
SDK upgrade (separate PR right after, now unblocked), postgres.js 4.

## 5. Test plan

**New tests**
- [ ] Config: unset `TELEMETRY_ENABLED` → `false` (boolean); `"true"` → `true`; existing NF-UNIT-CFG-01 green.
- [ ] Security regression: for each capped request array, posting `max+1` elements → 400 with a single
      `too_big` issue (proves the early-reject path, not just a length check after parsing).
- [ ] Guard: a unit test (or CI grep) failing if `zod/v3` is imported anywhere in `src/`.

**Must stay identical to the measurements in §2**
- [ ] `tsc --noEmit` 0 errors; unit all green; integration fail set == `main` baseline.
- [ ] Provider wire schemas: re-run the schema dump — all 17 still byte-identical to zod 3 output.
- [ ] Config differential (unset env + explicit env): only `TELEMETRY_ENABLED` differs, and now as boolean `false`.
- [ ] `node scripts/audit-gate.mjs` passes **with the allowlist entry removed**.

**Pre-merge prod check (same as dependency batches)**
- [ ] Build the prod Dockerfile image; boot against `pgvector/pgvector:pg16` in `NODE_ENV=production`:
      health 200, unauth 401, oversized body 413, migrations applied, logs identical to `main`.
- [ ] One request per validated route family with an invalid body → still 400 (not 500).

## 6. Rollout & rollback

- Merge on explicit "merge #N" only; watch the push-triggered `main` run through Publish + Deploy;
  probe prod `/health`, an authenticated 400 path, and `/login`.
- **Rollback:** `git revert` the squash commit → CI redeploys zod 3. Note the revert re-opens the
  audit exception, which is expired after 2026-12-31 — so merge **well before** the deadline
  (target: first half of December) to keep a revert path that does not turn CI red.

## 7. Acceptance criteria

- [ ] zod ≥ 4.6.6 in root lockfile; Dependabot alert #109 closed.
- [ ] `.github/audit-allowlist.json` has no zod entry; CI audit gate green.
- [ ] No `zod/v3` imports in `src/`.
- [ ] All 8 request-facing arrays capped, with regression tests.
- [ ] Every item in §5 checked; evidence (counts, diffs) pasted into the PR description.
- [ ] Docs updated (backlog row → Done, OPS-M-09 note marked superseded).

## 8. Measurement reproduction

Scratch scripts used for §2 (kept out of the repo; re-create in `tmp_verification/` if needed):
zod 4 installed into a detached worktree of `main`, then
`tsc --noEmit` (error census), `npm test`, `npm run test:integration` (diffed against a `main` run),
an `asSchema(zodSchema(schema)).jsonSchema` dump of every agent/tool schema on both trees,
a fresh-process import of `src/shared/config.ts` under a synthetic env on both trees, and a
200,000-element array probe against `zod@3.25.76`, `zod@4.6.7` and `zod@4.6.7/v3`.
