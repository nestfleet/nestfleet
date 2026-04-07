# CG-13: Cloud-Connection Data-Flow Documentation

**Status**: DRAFT — for customer security review teams.
**Last updated**: 2026-03-19
**Audience**: Customer security, compliance, and IT teams evaluating NestFleet for deployment

---

## 1. Overview

NestFleet is a client-installed product. All customer data is processed and stored on customer infrastructure. The optional cloud-connection channel provides license validation, update checks, and opt-in telemetry. This document details exactly what data flows through the cloud connection.

## 2. Network Endpoints

| Endpoint | Purpose | Protocol | Required? |
|---|---|---|---|
| `https://cloud.nestfleet.io/api/v1/license/validate` | License validation | HTTPS (TLS 1.2+) | Optional |
| `https://cloud.nestfleet.io/api/v1/updates/manifest` | Update check | HTTPS (TLS 1.2+) | Optional |
| `https://cloud.nestfleet.io/api/v1/telemetry` | Aggregate telemetry | HTTPS (TLS 1.2+) | Opt-in only |

### Firewall Configuration

To enable cloud connection, allow outbound HTTPS (port 443) to `cloud.nestfleet.io`. No inbound connections are required. If cloud connection is not desired, no firewall rules need to be configured.

## 3. Data Sent (Outbound from Customer Infrastructure)

### 3.1 License Validation Request

```json
{
  "license_key": "nf_lic_<32-hex-chars>",
  "product": "nestfleet",
  "org_id": "<opaque-identifier>"
}
```

- Frequency: every 6 hours (configurable)
- Contains: opaque license key, product identifier, organization identifier
- Does NOT contain: any personal data, case content, or operational data

### 3.2 Update Check Request

```
GET /api/v1/updates/manifest?installation=<license-sub>&version=0.1.0
```

- Frequency: every 1 hour (configurable)
- Contains: installation identifier (from license JWT `sub` claim), product version
- Does NOT contain: any personal data or operational data

### 3.3 Telemetry (Opt-In Only)

```json
{
  "license_key": "nf_lic_...",
  "period": "2026-03",
  "metrics_json": {
    "cases_total": 150,
    "cases_auto_resolved": 105,
    "agent_calls": 400,
    "total_tokens": 250000,
    "error_count": 3
  }
}
```

- Frequency: monthly (if enabled)
- Contains: aggregate counts only — no PII, no case content, no conversation data
- Disabled by default: `TELEMETRY_ENABLED=false`
- Customer can verify by inspecting `src/telemetry/` source code

## 4. Data Received (Inbound to Customer Infrastructure)

### 4.1 License Validation Response

```json
{
  "valid": true,
  "plan": "TEAM",
  "expires_at": "2027-12-31T23:59:59Z",
  "features": ["github_integration", "slack_integration", "sso_saml", ...]
}
```

### 4.2 Update Manifest Response

```json
{
  "latestVersion": "0.2.0",
  "releaseNotes": "Bug fixes and performance improvements",
  "updateUrl": "https://releases.nestfleet.io/v0.2.0",
  "securityAlert": false
}
```

## 5. Data NEVER Transmitted

The following data categories are NEVER sent through the cloud connection under any circumstances:

| Category | Examples |
|---|---|
| Case content | Titles, descriptions, triage output |
| Conversations | Email bodies, chat messages, thread history |
| Personal data | End-user names, email addresses, identities |
| Code | Diffs, PR content, repository data, GitHub tokens |
| LLM data | Prompts, responses, model outputs |
| Product memory | Knowledge base chunks, FAQs, runbooks |
| Credentials | API keys, passwords, SSH keys, OAuth tokens |
| Internal metrics | Per-case timing, per-user activity, agent output content |

## 6. Offline Resilience

| Scenario | Behavior |
|---|---|
| Cloud unreachable | Product continues normally; license state cached locally |
| License expired | Update channel disabled; all local features continue |
| Cloud connection disabled | Product operates fully offline; set `NESTFLEET_LICENSE_KEY` to empty |
| Network outage | Automatic retry with exponential backoff; no data loss |

**No kill switch**: NestFleet never stops operating due to cloud connection issues. The worst case is that update notifications are delayed.

## 7. Verification

Customers can independently verify cloud-connection behavior:

1. **Source code audit**: All cloud-connection code is in `src/license/` and `src/telemetry/` — fully auditable
2. **Network monitoring**: Monitor outbound connections from the NestFleet process using standard tools (tcpdump, Wireshark, network proxy)
3. **Environment variables**: Set `PLATFORM_CLOUD_URL` to a local proxy to intercept and inspect all requests
4. **Disable completely**: Remove `NESTFLEET_LICENSE_KEY` from `.env` — zero outbound connections

## 8. Compliance Summary

| Requirement | Status |
|---|---|
| GDPR Art. 28 (Processor obligations) | NestFleet is processor for cloud-connection metadata only |
| GDPR Chapter V (International transfers) | Cloud hosted in EU (Frankfurt) by default; SCCs available for non-EU |
| Customer data sovereignty | All operational data stays on customer infrastructure |
| Right to audit | Source code is visible; network traffic is verifiable |
| Data minimization | Only opaque identifiers and aggregate counts transmitted |

---

**IMPORTANT**: This is an engineering-informed document. Customers should review it with their security and legal teams. NestFleet is committed to transparency — if any data flow is unclear, contact security@nestfleet.io.
