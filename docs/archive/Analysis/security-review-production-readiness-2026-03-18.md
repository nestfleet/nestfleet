# Security SA Review — NestFleet Production Readiness
**Date:** 2026-03-18
**Reviewer:** Security Solutions Architect
**Scope:** Secrets management, authentication hardening, encryption, transport security, OWASP alignment, GDPR posture

---

## Executive Summary

NestFleet's MVP codebase demonstrates a solid structural foundation (layered architecture, Zod validation, OTel tracing, typed error handling) but has **8 security findings** that must be remediated before production launch. Two findings are **CRITICAL/HIGH** and create direct data-breach risk. The overall production readiness posture for security is: **NOT READY — remediation required**.

---

## Findings

### SEC-01 — CRITICAL: Missing Product-Scoped Authorization

**Risk:** Tenant data breach
**Location:** `src/api/v1/cases.ts:46`, all routes using `requireAuth()`

**Observed code:**
```typescript
casesRouter.get("/products/:productId/cases", requireAuth(), async (c) => {
  const productId = c.req.param("productId")
  // ← NO AUTHORIZATION CHECK: user.productIds.includes(productId) never evaluated
  const cases = await findCasesByProduct(productId, { status, severity, limit, offset })
})
```

`requireAuth()` in `src/auth/middleware.ts` validates the JWT signature and expiry but **never verifies that the authenticated user has access to the requested `productId`**. Any authenticated user can enumerate any product's cases, change events, and signals by simply substituting another product's UUID in the URL.

**Fix — add a `requireProductAccess()` middleware:**
```typescript
// src/auth/middleware.ts
export function requireProductAccess(): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user") as JwtPayload
    const productId = c.req.param("productId")
    if (productId && !user.productIds.includes(productId)) {
      throw new HTTPException(403, { message: "Access denied to product" })
    }
    await next()
  }
}

// Usage:
casesRouter.get("/products/:productId/cases",
  requireAuth(),
  requireProductAccess(),  // ← add everywhere
  async (c) => { ... })
```

Apply to **every route** that has a `:productId` path parameter.

---

### SEC-02 — HIGH: API Keys Stored in Plaintext

**Risk:** Credential exposure via DB breach
**Location:** `src/memory/ingestion/*.ts`, DB column `api_key` in products table

LLM API keys and GitHub tokens are stored as plaintext strings in the database. A single SQL injection, backup leak, or DB admin access event exposes all tenant credentials.

**Fix — envelope encryption with AES-256-GCM:**

```typescript
// src/shared/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const KEY = Buffer.from(process.env.SECRET_ENCRYPTION_KEY!, "hex") // 32 bytes = 64 hex chars

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}
```

`SECRET_ENCRYPTION_KEY` is a **Class A secret** (never in DB, only in process environment or secrets manager). Rotate it via re-encryption migration. Add a DB migration to change `api_key` column to `encrypted_api_key TEXT`.

---

### SEC-03 — HIGH: No Login Rate Limiting

**Risk:** Credential brute-force
**Location:** `src/api/v1/auth.ts` (login route)

The `/auth/login` endpoint has no rate limiting. An attacker can attempt millions of password combinations without throttling.

**Fix:**
```typescript
import { rateLimiter } from "hono-rate-limiter"

authRouter.post("/login",
  rateLimiter({
    windowMs: 15 * 60 * 1000,  // 15-minute window
    limit: 10,                   // 10 attempts per window per IP
    keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "unknown",
    handler: (c) => c.json({ error: "Too many login attempts" }, 429),
  }),
  async (c) => { ... }
)
```

For B2B SaaS, also consider **account lockout after N failures** stored in Redis with TTL.

---

### SEC-04 — HIGH: CORS Misconfiguration (`origin: ""`)

**Risk:** CORS policy silently broken in production
**Location:** `src/api/index.ts`

```typescript
origin: config.NODE_ENV === "production"
  ? (config.CONSOLE_ORIGIN ?? "")  // ← "" if env var unset — invalid, browser rejects all
  : ["http://localhost:3002", ...]
```

If `CONSOLE_ORIGIN` is not set in production, `origin: ""` causes all CORS preflight requests to fail. This silently breaks the web console for all users.

**Fix:**
```typescript
// Fail fast at startup, not silently at runtime
if (config.NODE_ENV === "production" && !config.CONSOLE_ORIGIN) {
  throw new Error("CONSOLE_ORIGIN must be set in production")
}

cors({
  origin: config.NODE_ENV === "production"
    ? config.CONSOLE_ORIGIN!
    : ["http://localhost:3002", "http://localhost:3001"],
  credentials: true,
})
```

---

### SEC-05 — MEDIUM: JWT Algorithm Not Pinned

**Risk:** Algorithm confusion attack (e.g., HS256 → none or RS256 confusion)
**Location:** `src/auth/jwt.ts`

```typescript
jwt.sign(payload, config.JWT_SECRET, { expiresIn })    // no algorithm pinned
jwt.verify(token, config.JWT_SECRET)                    // accepts whatever algo token claims
```

**Fix:**
```typescript
jwt.sign(payload, config.JWT_SECRET, { expiresIn, algorithm: "HS256" })
jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] })
```

Also: reduce `DEFAULT_EXPIRES_IN` from `"7d"` to `"1h"` with refresh token flow, or add a token revocation list (Redis set of jti values).

---

### SEC-06 — MEDIUM: Database SSL Not Enforced

**Risk:** Credentials in transit on managed DB / shared network
**Location:** `.env.example`, `src/infra/db/client.ts`

`DATABASE_URL` in `.env.example` has no SSL parameter. On managed databases (RDS, Cloud SQL, Neon), connections may default to unencrypted.

**Fix:**
```
# .env.example
DATABASE_URL=postgresql://user:password@host:5432/nestfleet?ssl=require&sslmode=verify-full
```

```typescript
// src/infra/db/client.ts
const db = postgres(config.DATABASE_URL, {
  ssl: config.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
})
```

---

### SEC-07 — MEDIUM: Missing Security Headers

**Risk:** XSS, clickjacking, MIME sniffing
**Location:** `src/api/index.ts`

No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Strict-Transport-Security` headers are set.

**Fix — add `hono/secure-headers` middleware:**
```typescript
import { secureHeaders } from "hono/secure-headers"

app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:"],
  },
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
}))
```

---

### SEC-08 — MEDIUM: No Secrets Management Strategy

**Risk:** Secret sprawl, rotation difficulty, accidental commit
**Location:** `.env.example`, deployment (no secrets manager referenced)

`.env.example` contains weak/placeholder secrets (`LICENSE_SECRET=nestfleet-dev-license-secret`). No `SECRET_ENCRYPTION_KEY` (needed for SEC-02 fix). No secrets rotation strategy.

**Recommended architecture:**

| Class | Secrets | Storage | Rotation |
|-------|---------|---------|----------|
| **Class A** | `JWT_SECRET`, `SECRET_ENCRYPTION_KEY`, DB credentials | AWS Secrets Manager / Doppler | Every 90 days, zero-downtime dual-key rotation |
| **Class B** | LLM API keys, GitHub tokens (per-tenant) | Encrypted in DB (AES-256-GCM, via SEC-02 fix) | On-demand via product settings UI |
| **Class C** | `NODE_ENV`, `PORT`, `LOG_LEVEL`, feature flags | Standard env vars / config file | N/A |

**Operational requirements:**
- Add `.env` to `.gitignore` (verify it's there)
- Add `SECRET_ENCRYPTION_KEY` to `.env.example` with `# Generate: openssl rand -hex 32` comment
- CI: add `gitleaks` or `truffleHog` pre-commit hook to block accidental secret commits
- Never log `process.env` dumps; use structured logging with allowlist

---

### SEC-09 — LOW: Weak License Validation (Defense in Depth)

**Risk:** License bypass
**Location:** `src/auth/license.ts`

`LICENSE_SECRET` appears as a static string used to sign license payloads. If the default dev value ships to production, license validation becomes trivial to bypass.

**Fix:** Enforce `LICENSE_SECRET` minimum entropy at startup:
```typescript
if (config.LICENSE_SECRET.length < 32 || config.LICENSE_SECRET.includes("dev")) {
  throw new Error("LICENSE_SECRET must be a strong random secret in production")
}
```

---

### SEC-10 — LOW: `audit_logs` Table Missing from Schema

**Risk:** GDPR Art. 30 / SOC 2 CC6 — no audit trail for access to personal data
**Location:** No `audit_logs` table in migrations

For EU-deployed B2B SaaS processing support ticket data (which likely contains personal data under GDPR), access to case records should be logged:
- Who accessed which case (`user_id`, `product_id`, `case_id`)
- Timestamp
- Action type (read, update, delete)

**Minimum viable audit log:**
```sql
CREATE TABLE audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL,
  product_id  UUID NOT NULL,
  resource    TEXT NOT NULL,   -- 'case', 'change_event', etc.
  resource_id UUID NOT NULL,
  action      TEXT NOT NULL,   -- 'read', 'update', 'delete'
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON audit_logs (product_id, created_at DESC);
CREATE INDEX ON audit_logs (user_id, created_at DESC);
```

---

### SEC-11 — INFO: `audience_violation` Branch Dead in Production

**Risk:** Abstain logic silent failure (no data breach, but incorrect behavior)
**Location:** `src/memory/retrieval/retrieval-service.ts:290`

```typescript
export function evaluateAbstain(chunks: EvidenceChunk[], request: RetrievalRequest): AbstainReason | null {
  const hasPublicChunk = chunks.some((c) => (c as any).audience !== "internal")
  if (audience === "public" && !hasPublicChunk) {
    return "audience_violation"  // ← DEAD BRANCH: EvidenceChunk has no .audience field
  }
  ...
}
```

`EvidenceChunk` is defined without an `audience` field. The `(c as any).audience` cast always returns `undefined`, so `!hasPublicChunk` is always `false`. The `audience_violation` abstain path is permanently unreachable at runtime.

**Fix:** Add `audience: "public" | "internal"` to `EvidenceChunk` type and populate it in `assembleEvidencePack`.

---

## Secrets Architecture Recommendation

### Key Hierarchy

```
Root of trust: SECRET_ENCRYPTION_KEY (Class A — never in DB)
    │
    ├── Encrypts → tenant API keys in DB (Class B, AES-256-GCM)
    ├── Encrypts → tenant GitHub tokens in DB (Class B)
    └── Encrypts → any future per-tenant Class B secrets

JWT_SECRET (Class A — separate key, never shared with encryption key)
    └── Signs → all user session tokens

DATABASE_URL credentials (Class A — rotation via Secrets Manager)
    └── Application → DB connection (SSL required in prod)
```

### Secret Generation Commands

```bash
# SECRET_ENCRYPTION_KEY (32 bytes = 256-bit AES key)
openssl rand -hex 32

# JWT_SECRET (32+ bytes)
openssl rand -base64 48

# LICENSE_SECRET
openssl rand -hex 32
```

### Secrets Manager Integration (AWS Secrets Manager example)

```typescript
// src/infra/secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"

const client = new SecretsManagerClient({ region: process.env.AWS_REGION })

export async function getSecret(secretId: string): Promise<string> {
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }))
  if (!response.SecretString) throw new Error(`Secret ${secretId} has no string value`)
  return response.SecretString
}
```

Load Class A secrets at startup (not hardcoded in environment for cloud deployments):
```typescript
// src/config.ts — production bootstrap
if (process.env.USE_SECRETS_MANAGER === "true") {
  process.env.JWT_SECRET = await getSecret("nestfleet/jwt-secret")
  process.env.SECRET_ENCRYPTION_KEY = await getSecret("nestfleet/encryption-key")
  process.env.DATABASE_URL = await getSecret("nestfleet/database-url")
}
```

---

## GDPR Posture

| Requirement | Status | Gap |
|-------------|--------|-----|
| Art. 25 — Data minimisation | Partial | Ticket content stored full-text; consider hashing or truncation after processing |
| Art. 30 — Records of processing | Missing | No audit_logs table (SEC-10) |
| Art. 32 — Security of processing | Partial | DB encryption missing (SEC-02), SSL not enforced (SEC-06) |
| Art. 33 — Breach notification (72h) | Not verified | No incident response runbook found |
| Art. 17 — Right to erasure | Missing | No DELETE cascade tested for user data |
| Art. 20 — Data portability | Missing | No export endpoint for user/tenant data |

---

## Production Readiness Summary

| Finding | Severity | Effort | Blocks Launch? |
|---------|----------|--------|----------------|
| SEC-01: Missing product-scoped auth | CRITICAL | Low (add middleware) | **YES** |
| SEC-02: API keys plaintext in DB | HIGH | Medium (crypto module + migration) | **YES** |
| SEC-03: No login rate limiting | HIGH | Low (middleware) | **YES** |
| SEC-04: CORS misconfiguration | HIGH | Low (fail-fast check) | **YES** |
| SEC-05: JWT algorithm not pinned | MEDIUM | Trivial | Recommended |
| SEC-06: DB SSL not enforced | MEDIUM | Low (config) | Recommended |
| SEC-07: Missing security headers | MEDIUM | Low (middleware) | Recommended |
| SEC-08: No secrets management strategy | MEDIUM | Medium (ops setup) | Recommended |
| SEC-09: Weak license validation | LOW | Trivial | No |
| SEC-10: No audit logs | LOW | Medium (table + middleware) | No (Phase 2) |
| SEC-11: audience_violation dead branch | INFO | Low (type fix) | No |

**Mandatory before launch: SEC-01, SEC-02, SEC-03, SEC-04**

---

## Recommended Remediation Order

1. **Immediate (this sprint):** SEC-01 (product access middleware), SEC-04 (CORS fix)
2. **Security sprint:** SEC-02 (envelope encryption + DB migration), SEC-03 (rate limiting)
3. **Pre-launch hardening:** SEC-05, SEC-06, SEC-07, SEC-08
4. **Phase 2:** SEC-10 (audit logs), SEC-11 (type fix), GDPR gaps

---

*Review based on code state as of 2026-03-18. Re-review required after SEC-01 and SEC-02 remediation.*
