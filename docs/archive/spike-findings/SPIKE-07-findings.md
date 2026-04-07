# SPIKE-07 Findings — Identity Boundary & RBAC for Lead-Role Operations

**Spike:** SPIKE-07 — OIDC-Compatible Identity Boundary with App-Level RBAC
**Run date:** 2026-03-17
**Stack:** Hono HTTP server, jose (JWT HS256), PostgreSQL 16, TypeScript modular monolith
**Scope:** Login, lead-role mapping, approval requests, approval actions, audit event generation

---

## Summary

| Metric | Value |
|--------|-------|
| Hypothesis confirmed | **PARTIALLY** |
| Auth mechanism chosen | JWT (HS256) — stepping stone to OIDC |
| Roles supported | 4 (`support_lead`, `product_lead`, `change_lead`, `knowledge_lead`) |
| Endpoints implemented | `POST /api/v1/auth/login` |
| Middleware guards | `requireAuth()`, `requireRole(role)` |
| Approval actions audited | Yes — `createAuditEvent` with `actor_type="user"` |
| OIDC integration | Deferred — migration path documented |

JWT-based authentication with app-level RBAC satisfies all functional requirements for lead-role operations, approval gating, and audit traceability. OIDC is deferred because v1 targets customer-installed deployments where a pre-configured OIDC provider cannot be assumed.

---

## Hypothesis and Verdict

**Hypothesis:** An OIDC-compatible identity boundary with app-level RBAC can support login, lead-role mapping, approval requests, approval actions, and audit event generation.

**Verdict: PARTIALLY — implement JWT-based auth first (stepping stone), OIDC migration planned for production hardening.**

The spike confirmed that the RBAC model, approval workflow, and audit event generation work correctly with JWT-based authentication. The OIDC requirement is partially met: the architecture is designed so that swapping the token validation layer from HS256 JWT to OIDC ID tokens does not require changes to the RBAC middleware, role model, or audit system.

---

## Rationale

Four factors drove the decision to implement JWT first and defer OIDC:

1. **Customer deployment model.** NestFleet v1 is client-installed on customer infrastructure. Most customers will not have a pre-configured OIDC provider (Keycloak, Auth0, Okta) available at install time. Requiring OIDC from day one would block or complicate initial deployments.

2. **Self-hosting simplicity.** JWT with HS256 requires only a secret stored in an environment variable. No additional services, no certificate management, no discovery endpoint configuration. This is the minimum viable identity boundary for a self-hosted product.

3. **RBAC model independence.** The RBAC layer (role checking, role-to-permission mapping, approval gating) operates on the JWT payload structure: `{ sub, email, roles, productIds }`. This same structure can be populated from OIDC claims without changing any downstream authorization logic.

4. **DocuGardener pilot context.** The first deployment is a single-operator pilot (the founder). OIDC infrastructure would add configuration overhead with zero security benefit for a solo user.

---

## Architecture Decisions Made

| Decision | Rationale |
|----------|-----------|
| JWT HS256 over OIDC for v1 | Self-hosted deployments cannot assume an OIDC provider. JWT minimizes infrastructure dependencies while maintaining the same RBAC model. |
| `roles TEXT[]` column over join table | A user holding 1-4 roles does not justify a separate `user_roles` join table. TEXT[] is simpler to query and update for the expected cardinality. |
| `product_ids TEXT[]` column | Scopes user permissions to specific products. Enables multi-product operators to restrict lead roles per product. |
| `requireAuth()` + `requireRole(role)` as separate middleware | Separation of concerns: authentication (is the token valid?) is independent of authorization (does the user have the right role?). Allows unauthenticated health-check endpoints while still enforcing roles on protected routes. |
| Secret from environment variable | `JWT_SECRET` is read from `process.env`. No hardcoded secrets. Supports rotation by restarting the process with a new secret. |
| Audit events with `actor_ref = userId` | Every approval action writes an audit event with `actor_type="user"` and `actor_ref=userId`. This provides an unambiguous, queryable trail linking actions to authenticated identities. |
| Password hashing (bcrypt) | Industry-standard password hashing. Cost factor configurable via environment for deployment-specific tuning. |
| OIDC migration as token-swap only | The RBAC middleware reads roles from the decoded token payload. Migrating to OIDC means replacing the token validation function (verify HS256 signature → verify OIDC ID token against JWKS endpoint). No changes to `requireRole()`, audit events, or the `operator_users` schema. |

---

## What Was Built

### Authentication Endpoint

**`POST /api/v1/auth/login`** — Accepts `{ email, password }`, validates credentials against the `operator_users` table, and returns a signed JWT.

JWT payload structure:

```json
{
  "sub": "user_id",
  "email": "operator@example.com",
  "roles": ["support_lead", "change_lead"],
  "productIds": ["prod_docugardener"],
  "iat": 1742169600,
  "exp": 1742256000
}
```

Token is signed with HS256 using the `JWT_SECRET` environment variable. Expiry is configurable (default: 24 hours).

### Middleware Guards

**`requireAuth()`** — Extracts the `Authorization: Bearer <token>` header, verifies the JWT signature and expiry, and attaches the decoded user payload to the request context. Returns 401 if the token is missing, malformed, or expired.

**`requireRole(role)`** — Reads the user payload from context (set by `requireAuth()`), checks if `user.roles` includes the required role. Returns 403 if the role is not present. Must be chained after `requireAuth()`.

### Database Schema

**`operator_users` table:**

| Column | Type | Constraints |
|--------|------|-------------|
| `user_id` | TEXT | PRIMARY KEY |
| `email` | TEXT | UNIQUE, NOT NULL |
| `password_hash` | TEXT | NOT NULL |
| `roles` | TEXT[] | NOT NULL, DEFAULT '{}' |
| `product_ids` | TEXT[] | NOT NULL, DEFAULT '{}' |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

### Role Model

Four lead roles map to NestFleet's operational structure:

| Role | Responsibility |
|------|---------------|
| `support_lead` | Manages case escalations, approves resolution strategies |
| `product_lead` | Approves product-impacting changes, prioritizes feature requests |
| `change_lead` | Approves change requests, gates PR drafts for implementation |
| `knowledge_lead` | Approves knowledge base updates, manages content quality |

A single user can hold multiple roles simultaneously. For the DocuGardener pilot, the founder holds all four roles.

### Approval Action Auditing

Approval and rejection actions (e.g., `approveChangeRequest()`, `rejectChangeRequest()`) require authentication via `requireAuth()` and role verification via `requireRole('change_lead')`. Every action writes an audit event:

```typescript
createAuditEvent({
  event_type: 'change_request.approved',
  entity_type: 'change_request',
  entity_ref: changeRequestId,
  actor_type: 'user',
  actor_ref: userId,
  metadata: { before_state, after_state, role_used: 'change_lead' }
});
```

The `role_used` field in metadata records which role authorized the action, supporting future scenarios where a user might hold multiple roles that could authorize the same action.

---

## Outstanding Items

| Item | Deferred to | Notes |
|------|-------------|-------|
| OIDC provider integration (Keycloak / Auth0) | Production hardening / EPIC-07 | Replace HS256 JWT verification with OIDC ID token verification against JWKS endpoint. RBAC middleware unchanged. |
| OIDC claim-to-role mapping | Production hardening / EPIC-07 | Map OIDC claims (e.g., `groups` or custom claims) to NestFleet lead roles. |
| Token refresh flow | SLICE-08 or later | Current implementation issues short-lived tokens. Refresh token flow needed for long sessions. |
| Password reset flow | SLICE-08 or later | Not needed for DocuGardener pilot (single operator). Required for multi-user deployments. |
| Rate limiting on `/auth/login` | SLICE-08 or later | Brute-force protection. Low priority for self-hosted, single-operator deployments. |
| Multi-product role scoping enforcement | Future slice | `product_ids` column exists; enforcement middleware not yet implemented. |

---

## Success Criteria Assessment

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| One user can hold multiple lead roles simultaneously | **PASS** | `roles TEXT[]` column on `operator_users`. JWT payload includes full roles array. `requireRole()` checks membership in the array. |
| Approval history is queryable and unambiguous | **PASS** | `audit_events` table with `entity_ref = changeRequestId`, `actor_ref = userId`, `event_type = 'change_request.approved'`. Standard SQL queries return full approval history per entity. |
| Audit events trace every approval action to authenticated identity and role | **PASS** | `createAuditEvent()` writes `actor_type="user"`, `actor_ref=userId`, and `metadata.role_used` on every approval and rejection action. |
| OIDC-compatible identity boundary | **DEFERRED** | JWT stepping stone implemented. OIDC migration path documented: swap token validation layer only. RBAC middleware, role model, and audit system are OIDC-ready (no structural changes needed). |

---

## Conclusion

SPIKE-07 confirms that JWT-based authentication with app-level RBAC is the correct stepping stone for NestFleet v1. The approach satisfies all functional requirements for login, lead-role mapping, approval gating, and audit traceability while keeping the deployment footprint minimal for self-hosted installations. The RBAC model is designed for OIDC compatibility: migrating to OIDC ID tokens requires only replacing the token validation function, with no changes to role enforcement, approval logic, or audit event generation. OIDC integration is deferred to production hardening when customer deployments justify the additional infrastructure. SPIKE-07 is complete.
