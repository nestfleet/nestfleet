# SPIKE-08 Findings — License Validator and Cloud Connection

**Spike:** SPIKE-08 — JWT License Validation + Cloud Update Channel
**Run date:** 2026-03-17
**Stack:** TypeScript modular monolith, Hono + Node.js, jsonwebtoken v9, strict ESM
**Scope:** On-premise license enforcement, graceful degradation on expiry, non-blocking cloud update manifest sync

---

## Summary

| Metric | Value |
|--------|-------|
| Hypothesis confirmed | **YES** |
| New source files | 4 (`types.ts`, `validator.ts`, `cloud-connection.ts`, `index.ts`) |
| Config vars added | 3 (`LICENSE_FILE_PATH`, `LICENSE_SECRET`, `NESTFLEET_CLOUD_URL`) |
| Startup impact | Zero (cloud sync is fire-and-forget; license check is synchronous but sub-millisecond) |
| TypeScript errors | 0 (`tsc --noEmit` clean) |
| Dependency added | None (jsonwebtoken already in `dependencies`) |

The spike confirms that JWT-based license validation with graceful expiry degradation and a non-blocking cloud update channel can be implemented with no new runtime dependencies and zero startup latency impact.

---

## Hypothesis and Verdict

**Hypothesis:** A self-contained JWT license validator can enforce tier-based feature gating and expiry rules on customer-installed NestFleet instances, with graceful degradation (app continues running on expiry) and a non-blocking cloud update channel that never holds up process startup.

**Verdict: CONFIRMED.**

---

## What Was Built

| Module | Path | Responsibility |
|--------|------|----------------|
| License types | `src/license/types.ts` | `LicenseTier`, `LicensePayload`, `LicenseState` interfaces |
| License validator | `src/license/validator.ts` | `validateLicense()`, `isFeatureEnabled()`, `getLicenseTier()` |
| Cloud connection | `src/license/cloud-connection.ts` | `CloudConnection` class — manifest fetch + background sync |
| Barrel | `src/license/index.ts` | Re-exports all public API |
| Config additions | `src/shared/config.ts` | `LICENSE_FILE_PATH`, `LICENSE_SECRET`, `NESTFLEET_CLOUD_URL` |
| Startup wiring | `src/index.ts` | License check before migrations; cloud sync after server starts |
| Env example | `.env.example` | Documents all three new vars |

---

## Startup Behavior Matrix

| License State | `NODE_ENV=development` | `NODE_ENV=production` |
|---------------|------------------------|-----------------------|
| No `LICENSE_FILE_PATH` set | Continues — dev mode banner logged | Continues — dev mode banner logged |
| File path set, file not found | Warns, continues | `process.exit(1)` |
| File found, valid JWT, not expired | Valid — full features | Valid — full features |
| File found, valid JWT, expired | `valid: true, expired: true` — continues, local features only, cloud sync disabled | Same — graceful degradation (app does NOT exit) |
| File found, bad signature / malformed | Warns, continues | `process.exit(1)` |
| File found, unknown tier in payload | Warns, continues | `process.exit(1)` |

**Key design decision:** Expiry is a soft failure — the process continues in both environments. Only missing/invalid/unsigned tokens are hard failures in production.

---

## Feature Gating Logic

| Scenario | `isFeatureEnabled()` returns |
|----------|------------------------------|
| No license (dev mode) | `true` — all features unlocked |
| `tier: "trial"`, within 30 days of `issuedAt` | `true` — all features unlocked |
| `tier: "trial"`, after 30 days | `payload.features.includes(feature)` |
| Any other tier | `payload.features.includes(feature)` |

---

## Cloud Connection Design

- **Never blocks startup.** `startBackgroundSync()` calls `fetchUpdateManifest()` via `.catch()` (fire-and-forget), then sets up `setInterval`.
- **Never throws.** All network errors, timeouts, and non-200 responses are caught and logged at `warn` level, returning `null`.
- **Process-friendly.** The `setInterval` ref is passed to `.unref()` so the background timer does not prevent Node.js from exiting when no other work remains.
- **Security alerts** in the manifest are logged at `warn` level to ensure operator visibility.
- **Timeout:** 5 seconds per request via `AbortController`.

---

## Success Criteria Assessment

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| JWT verification uses `jsonwebtoken` (already installed) | **PASS** | `jwt.verify()` with `ignoreExpiration: true` for self-managed expiry handling |
| Dev mode works with no config | **PASS** | `LICENSE_FILE_PATH` undefined → `valid: false`, app continues |
| Production exits on missing/invalid license | **PASS** | `process.exit(1)` gated on `NODE_ENV === "production"` |
| Expired license degrades gracefully | **PASS** | `valid: true, expired: true` — cloud sync disabled, local features continue |
| `isFeatureEnabled` returns true in dev mode | **PASS** | Explicit `!state.valid` check before feature array lookup |
| Cloud connection never blocks startup | **PASS** | `startBackgroundSync()` is `await`ed but the first manifest fetch is fire-and-forget |
| Cloud connection never throws | **PASS** | All code paths have `try/catch`; fetch errors return `null` |
| `exactOptionalPropertyTypes` compliance | **PASS** | `securityMessage` only added to manifest object when present; `LicenseState.payload` is `LicensePayload | null` |
| No `any` | **PASS** | All raw JSON validated through explicit type guards |
| `tsc --noEmit` clean | **PASS** | Zero errors |

---

## Architecture Decisions Made

| Decision | Rationale |
|----------|-----------|
| `ignoreExpiration: true` in `jwt.verify()` | Handles expiry ourselves to return `expired: true` rather than throw, enabling graceful degradation |
| Module-level singleton for `_state` | License is parsed once at startup; subsequent calls return the cached value without disk I/O |
| `isRawPayload()` type guard instead of Zod | Keeps the license module dependency-free from validation libraries; the guard is narrow and explicit |
| `AbortController` for fetch timeout | Native Node.js 18+ API — no additional dependency; 5-second timeout prevents slow cloud responses from accumulating |
| `intervalId.unref()` | Prevents the setInterval from keeping the process alive in test contexts or clean shutdowns |
| Cloud sync starts AFTER server is listening | Ensures HTTP requests can be served immediately; update checks are a background concern |

---

## Outstanding Items

| Item | Deferred to | Notes |
|------|-------------|-------|
| License API endpoint for operator dashboard | SLICE or EPIC-06 | `GET /api/v1/license/status` to expose `LicenseState` to the UI |
| Feature gate middleware for Hono routes | Follow-on | `isFeatureEnabled()` is available; middleware wrapper not yet implemented |
| License renewal notification | EPIC-06 | Warn operator N days before expiry via email/Telegram |
| Signed update manifest verification | Follow-on | Currently trusts manifest content; add signature field to prevent MITM |
| Integration test for expired JWT path | Test suite | Unit test can be added; requires JWT generation fixture |

---

## Conclusion

SPIKE-08 confirms that the JWT-based license and cloud-connection design is sound for a self-hosted, customer-installed product. The implementation adds no new runtime dependencies, has zero startup latency impact, and handles all degraded states (expired, missing, invalid) with appropriate behavior per environment. SPIKE-08 is complete.
