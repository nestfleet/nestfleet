# CG-09: Data Protection Impact Assessment (DPIA) Template

**Status**: DRAFT — requires review by qualified legal counsel and DPO before publication.
**Last updated**: 2026-03-19
**Audience**: Customer compliance teams deploying NestFleet

---

## Part A: Customer-Side DPIA (for customer's NestFleet installation)

### A.1 Processing Description

| Field | Value |
|---|---|
| Controller | [Customer name] |
| Processor | [Customer name] (self-hosted — NestFleet vendor has no access to operational data) |
| Processing purpose | AI-assisted customer support: triage, routing, auto-reply, change management, knowledge base maintenance |
| Lawful basis | Legitimate interest (Art. 6(1)(f)) for support operations; or contractual necessity (Art. 6(1)(b)) if support is part of the service agreement |
| Data subjects | End users who submit support requests; customer employees who operate the console |
| Data categories | Email addresses, names, support request content, conversation history, case metadata |
| Special categories | None by default. Customer must assess if support content may contain health, political, or other Art. 9 data |

### A.2 Necessity and Proportionality

- AI processing is limited to support operations — no profiling, no automated decision-making with legal effects
- All consequential actions (T3+) require human approval before execution
- Auto-replies are limited to T1 (low-risk, validated) with a 4-gate validation envelope
- Agents abstain and escalate when confidence is below threshold
- No cross-customer data sharing — product memory is strictly product-scoped

### A.3 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Inaccurate AI response sent to user | Medium | Medium | 4-gate validation (confidence, source tier, human review flag, forbidden phrases), abstain-and-escalate policy |
| Unauthorized access to support data | Low | High | RBAC with 6 roles, JWT auth, product access enforcement, audit trail |
| Data retention beyond necessary period | Low | Medium | Configurable retention policy, auto-deletion sweep, GDPR Art. 17 erasure endpoint |
| LLM provider processes personal data | Medium | Medium | Customer controls LLM credentials, minimized prompts (evidence pack only, not full conversation), prompt sanitization |
| Cross-product data leakage | Low | High | All queries scoped by product_id, workers read authoritative product_id from DB |

### A.4 Mitigation Measures

1. **Technical**: RBAC, encryption in transit (TLS), audit trail on every action, Zod schema validation on all AI outputs, state machine guards on all transitions
2. **Organizational**: AI disclosure on end-user communications, human approval gates for consequential actions, configurable quiet hours
3. **Data minimization**: Evidence packs contain only relevant chunks (not full conversation history), prompt sanitization removes HTML/XML tags
4. **Retention**: Configurable per-product retention window, auto-deletion of expired cases with cascading cleanup
5. **Subject rights**: DSAR search and export endpoint, GDPR erasure function for agent run outputs

### A.5 DPO Consultation

[To be completed by customer's Data Protection Officer]

---

## Part B: Vendor-Side DPIA (for NestFleet cloud-connection metadata)

### B.1 Processing Description

| Field | Value |
|---|---|
| Controller | NestFleet GmbH (or applicable entity) |
| Processing purpose | License validation, update delivery, aggregate product analytics |
| Data categories | License key, installation ID, product version, aggregate usage counts (no PII) |
| Data subjects | None — no natural person data is processed through the cloud connection |

### B.2 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Metadata leaks customer identity | Very Low | Low | License keys are opaque identifiers; no PII in metadata |
| Cloud connection used to exfiltrate data | Very Low | High | Open-source code auditable; network traffic verifiable; cloud connection is optional |

### B.3 Conclusion

The cloud-connection metadata processing is low-risk and does not process personal data of natural persons. A full DPIA under Art. 35 is likely not required for the vendor-side processing but is provided for completeness.

---

**IMPORTANT**: This template is engineering-informed. Customer DPOs must adapt it to their specific deployment context. The vendor-side DPIA must be reviewed by qualified counsel.
