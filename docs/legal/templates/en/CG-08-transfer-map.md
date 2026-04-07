# CG-08: Cloud-Connection Transfer Map

**Status**: DRAFT — requires review by qualified legal counsel before publication.
**Last updated**: 2026-03-19
**Scope**: Cloud-connection metadata only. Customer operational data is explicitly out of scope.

---

## 1. Deployment Model

NestFleet is a **client-installed** software product. The customer deploys NestFleet on their own infrastructure (Kubernetes, Docker, bare metal). Customer operational data (support cases, conversations, code, PII) is processed and stored exclusively on customer infrastructure. NestFleet (the vendor) never receives, stores, or processes customer operational data.

## 2. Cloud-Connection Purpose

The optional cloud-connection channel serves three purposes:
1. **License validation**: verify license key validity, plan tier, expiry
2. **Update checks**: fetch update manifests (latest version, security alerts)
3. **Aggregate telemetry** (opt-in only): anonymous usage counts for product improvement

## 3. Data Sent FROM Customer Installation TO NestFleet Cloud

| Data Element | Example | Contains PII? | Purpose |
|---|---|---|---|
| License key | `nf_lic_ff00...ff06` | No | License validation |
| Installation ID | `sub` claim from license JWT | No | Identify installation |
| Product version | `0.1.0` | No | Update compatibility |
| Aggregate usage counts (opt-in) | `{"month":"2026-03","cases":150,"agentCalls":400}` | No | Product analytics |
| Error type codes (opt-in) | `{"triageErrors":2,"prDraftErrors":0}` | No | Quality improvement |

### Data explicitly NEVER sent:
- Case content or titles
- Conversation messages or email bodies
- User identities, email addresses, or names
- Code, diffs, PR content, or repository data
- LLM prompts or responses
- Notification content
- Product memory / knowledge base content

## 4. Data Received BY Customer Installation FROM NestFleet Cloud

| Data Element | Example | Purpose |
|---|---|---|
| License validation result | `{"valid":true,"plan":"TEAM","features":[...]}` | Enable/disable features |
| Update manifest | `{"latestVersion":"0.2.0","securityAlert":false}` | Inform operator of updates |
| Compliance templates | DPIA templates, privacy notices | Support customer compliance |

## 5. Transfer Mechanism

| Scenario | Mechanism |
|---|---|
| NestFleet Cloud hosted in EU (Frankfurt) | No cross-border transfer — same region |
| NestFleet Cloud hosted outside EU | EU Standard Contractual Clauses (SCCs) Module 4 (processor-to-controller) apply to the metadata flow only |
| Customer opts out of cloud connection | No transfer occurs — product operates fully offline |

## 6. Data Processing Roles

| Party | Role | Scope |
|---|---|---|
| Customer | Data controller + processor | All operational data (cases, conversations, PII) on their infrastructure |
| NestFleet (vendor) | Data processor | Cloud-connection metadata ONLY (license ID, version, aggregate counts) |
| Customer's LLM provider | Sub-processor (customer's) | Prompt/response data — customer's direct relationship, not NestFleet's |
| Customer's GitHub | Sub-processor (customer's) | Issue/PR data — customer's direct relationship |
| Customer's email provider | Sub-processor (customer's) | Email content — customer's direct relationship |

## 7. Offline Resilience

- NestFleet operates fully without cloud connection
- No kill switch — expired or unreachable license degrades gracefully (update channel disabled, local features continue)
- Cloud connection is checked every 6 hours (configurable)
- First connection attempt is non-blocking — never delays server startup

## 8. Customer Actions

- Cloud connection is optional — disable by not setting `NESTFLEET_LICENSE_KEY`
- Telemetry is opt-in — disabled by default (`TELEMETRY_ENABLED=false`)
- Network endpoints: `PLATFORM_CLOUD_URL` (default: `https://cloud.nestfleet.io`)
- Customer can independently verify traffic using network monitoring tools

---

**IMPORTANT**: This document is an engineering-informed draft. It must be reviewed by qualified legal counsel before being provided to customers or used as a contractual basis.
