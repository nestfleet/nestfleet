# Session Summary — Test Coverage (P0-P2) + Security SA Review
**Date:** 2026-03-18
**Session scope:** AE-02 / SLICE-16 test coverage, retrieval-service exports, security production readiness review

---

## Work Completed

### 1. P0-P2 Test Coverage — 3 New Test Files, 85 Tests Total

#### Priority mapping
| Priority | File | Rationale |
|----------|------|-----------|
| P0 | `tests/unit/agents/sanitize.test.ts` | Security-critical: prompt injection defense (ADR-027) |
| P0 | `tests/unit/memory/retrieval-service.test.ts` | Core trust gate: abstain logic, tier gates |
| P1 | `tests/unit/agents/run-agent.test.ts` | Agentic execution: two-phase pipeline, error translation |
| P2 | `tests/unit/memory/freshness.test.ts` | Already covered in prior session |

#### Source change required
`src/memory/retrieval/retrieval-service.ts` — added `export` keyword to 4 private pure functions (tagged `@internal`) so they can be unit tested without integration test overhead:
- `RawCandidate` interface
- `rerankCandidates()`
- `applyVersionFilter()`
- `evaluateAbstain()`

---

### 2. `sanitize.test.ts` — 25 Tests (P0 Security)

**What's tested:**
- `sanitizeUserContent`: tag stripping (opening, closing, self-closing, attributes, uppercase, underscores, mixed-case), text content between tags preserved, non-tag content untouched (`<` before digits/spaces not stripped)
- `wrapUserContent`: default tag, custom tag, empty string, newlines
- `prepareUserContent`: sanitize + wrap pipeline, custom tag, plain text passthrough
- **Critical injection scenarios (ADR-027):** `<SYSTEM>` injection, `</USER_TICKET_CONTENT>` delimiter escape, nested XML injection

**Key insight:** regex strips tag markup but preserves text content between tags. `<script>alert(1)</script>text` → `alert(1)text` (not `text`).

**Bug fixed during test writing:** initial assertion used `"<SIGNAL>text</SIGNAL>"` but actual output was `"<SIGNAL>alert(1)text</SIGNAL>"` — corrected to match actual behavior.

---

### 3. `retrieval-service.test.ts` — 41 Tests (P0 Abstain Logic)

**What's tested:**
- `rerankCandidates`: tier weights (T1=1.0, T2=0.85, T3=0.65, T4=0.45), freshness floor at 0.1, composite score = fusedScore × tierWeight × max(freshness, 0.1), sort descending
- `applyVersionFilter`: `*` wildcard passthrough, exact version match, mismatch filtered, undefined version returns all
- `evaluateAbstain`: all 4 abstain paths with priority order: `audience_violation` > `knowledge_conflict` > `insufficient_tier` > `stale_evidence`
- **SPIKE-01 finding:** "fresh T3 chunks do NOT rescue a stale T1" — `bestT1T2` is the first T1/T2 in sorted order, not averaged across all

**Bug documented (not fixed):** `audience_violation` branch is permanently dead code in production pipeline:
- `EvidenceChunk` type has no `audience` field
- `evaluateAbstain` checks `(c as any).audience` which is always `undefined`
- `!hasPublicChunk` is always `false` → branch never taken
- Tests cover it with synthetic data (casting) and document the bug; fix is SEC-11

---

### 4. `run-agent.test.ts` — 19 Tests (P1 Execution Behavior)

**What's tested:**
- Single-phase path (`triage`, `auto_reply`): `generateObject` called directly, `generateText` not called
- Two-phase path (`change_prep`, `outage_routing`): `generateText` first then `generateObject`, call order verified
- Token aggregation: Phase 1 + Phase 2 tokens summed correctly
- Synthesis prompt dedup threshold (100 chars): `phase1.text >= 100` → "Analysis and evidence:", `< 100` → "Tool lookup results:" + raw tool results
- Budget pre-check: oversized prompt → `TokenBudgetError` before any LLM call
- Error translation: `AI_NoObjectGeneratedError` → `StructuredOutputError` with `schemaVersion`
- Known error passthrough: `LlmTimeoutError`, `TokenBudgetError`, unexpected errors re-thrown unchanged
- Timeout: `LlmTimeoutError` thrown after configured timeout, `timeoutMs` field correct

**Vitest fake timer bug fixed:**
- `vi.advanceTimersByTimeAsync(25_001)` deadlocked with default `vi.useFakeTimers()` — vitest uses `setImmediate` internally in that method, creating circular dependency
- Fix: `vi.useFakeTimers({ toFake: ["setTimeout"] })` (only fake setTimeout) + synchronous `vi.runAllTimers()`
- Wrong action type fixed: `triage` timeout is 90_000ms; used `outage_routing` (15_000ms, smallest) instead
- Two-phase action means `generateText` (not `generateObject`) must be mocked to never resolve

---

### 5. Backlog Updates

**`docs/v1-spikes-and-delivery-backlog.md`:**
- Phase 4 delivery row: `⏳ pending` → `🔄 IN PROGRESS`
- SLICE-17 marked ✅ 2026-03-18
- Section 11 Test Coverage Gaps: 6 new rows added tracking all new test files and the `audience_violation` open bug

---

### 6. Security SA Review

Full review saved to: `docs/Analysis/security-review-production-readiness-2026-03-18.md`

**11 findings (SEC-01 through SEC-11):**

| # | Severity | Finding | Blocks Launch? |
|---|----------|---------|----------------|
| SEC-01 | CRITICAL | Missing product-scoped authorization — `requireAuth()` never checks `user.productIds.includes(productId)` | YES |
| SEC-02 | HIGH | API keys stored plaintext in DB — needs AES-256-GCM envelope encryption | YES |
| SEC-03 | HIGH | No login rate limiting — brute force possible | YES |
| SEC-04 | HIGH | CORS `origin: ""` when `CONSOLE_ORIGIN` unset — silently breaks web console | YES |
| SEC-05 | MEDIUM | JWT algorithm not pinned — algorithm confusion attack vector | Recommended |
| SEC-06 | MEDIUM | DB SSL not enforced in config | Recommended |
| SEC-07 | MEDIUM | No security headers (CSP, X-Frame-Options, HSTS) | Recommended |
| SEC-08 | MEDIUM | No secrets management strategy — weak defaults, no rotation plan | Recommended |
| SEC-09 | LOW | Weak license validation — dev default could slip to prod | No |
| SEC-10 | LOW | No audit_logs table — GDPR Art. 30 gap | No (Phase 2) |
| SEC-11 | INFO | `audience_violation` abstain branch permanently dead — type bug | No |

**Secrets classification:**
- **Class A (process secrets):** `JWT_SECRET`, `SECRET_ENCRYPTION_KEY`, DB credentials — AWS Secrets Manager / Doppler
- **Class B (encrypted at-rest):** LLM API keys, GitHub tokens per tenant — AES-256-GCM in DB
- **Class C (public config):** `NODE_ENV`, `PORT`, `LOG_LEVEL` — standard env vars

---

## Key Technical Decisions Made

1. **Export `@internal` symbols vs. integration test** — chose `@internal` exports over integration test setup (Docker, real DB) because pure functions deserve fast isolated unit tests; integration tests cover the DB-querying `hybridSearch` path which genuinely needs a real DB.

2. **`vi.useFakeTimers({ toFake: ["setTimeout"] })`** — intentional scoped faking to avoid vitest internal deadlock; documented in test file comments.

3. **`audience_violation` bug** — documented in tests and security review rather than silently fixing, so the team is aware it's dead code (fixing requires a type change and DB query update to include `audience` in `SELECT`).

4. **SEC-01 fix design** — `requireProductAccess()` as a separate composable middleware (not patched into `requireAuth()`) to preserve the separation of authentication vs. authorization and allow routes that don't have `:productId` to use `requireAuth()` alone.

---

## Open Items

| Item | Priority | Owner |
|------|----------|-------|
| SEC-01: Add `requireProductAccess()` middleware | CRITICAL | Backend |
| SEC-02: AES-256-GCM encryption + DB migration | HIGH | Backend |
| SEC-03: Rate limiting on login route | HIGH | Backend |
| SEC-04: CORS fail-fast check | HIGH | Backend |
| Fix `audience_violation` dead branch (SEC-11 / type fix) | Low | Backend |
| GDPR Art. 30 audit log table | Low | Phase 2 |
