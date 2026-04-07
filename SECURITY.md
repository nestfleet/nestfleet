# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report security issues to: **security@nestfleet.dev**

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 14 days for critical issues.

You can also review our machine-readable security disclosure information at:
`https://nestfleet.dev/.well-known/security.txt`

## Supported Versions

| Version | Supported |
|---|---|
| latest `main` | ✅ |
| older releases | ❌ — please upgrade |

## Security Hardening Notes

- All API endpoints require JWT authentication (except `/health`, `/auth/login`, `/auth/register` when enabled, and `/.well-known/security.txt`)
- Passwords are hashed with bcrypt (cost factor 12 by default, configurable via `BCRYPT_ROUNDS` env var, range 10–14)
- API keys stored encrypted at rest (AES-256-GCM)
- Rate limiting on all public endpoints
- `REGISTRATION_ENABLED` defaults to `false` — set explicitly to enable public signup
- Self-hosted deployments: rotate `JWT_SECRET` and `ENCRYPTION_KEY` before going to production
