# CG-11: NestFleet Acceptable Use Policy

**Status**: DRAFT — requires review by qualified legal counsel before publication.
**Last updated**: 2026-03-19

---

## 1. Purpose

This Acceptable Use Policy ("AUP") defines the permitted and prohibited uses of NestFleet software. All users and licensees must comply with this policy.

## 2. Permitted Uses

NestFleet is designed and licensed exclusively for:
- Customer support operations (triage, routing, response drafting, escalation)
- Software change management (bug tracking, change requests, PR drafting)
- Product knowledge management (documentation, FAQs, runbooks)
- Operational analytics (cost tracking, agent performance, case metrics)

## 3. Prohibited Uses

NestFleet must NOT be used for:

### 3.1 AI Act Prohibited Practices (Art. 5)
- Social scoring or behavioral classification of natural persons
- Real-time biometric identification in publicly accessible spaces
- Exploitation of vulnerabilities of specific groups (age, disability, social situation)
- Subliminal manipulation techniques

### 3.2 High-Risk Use Cases (Art. 6) — Not Supported
- **Employment and HR decisions**: hiring, promotion, termination, performance evaluation
- **Credit and insurance scoring**: creditworthiness assessment, risk pricing
- **Law enforcement**: predictive policing, evidence evaluation, crime detection
- **Public service eligibility**: benefits allocation, social assistance determination
- **Education and training**: student assessment, admission decisions
- **Immigration and border control**: asylum, visa, residence permit processing

### 3.3 Additional Prohibited Uses
- Medical diagnosis or treatment recommendations
- Legal advice or judicial decision support
- Financial investment advice or trading decisions
- Surveillance or monitoring of individuals
- Generation of synthetic media ("deepfakes") for deception
- Any use that violates applicable laws or regulations

## 4. Technical Enforcement

NestFleet implements the following technical controls to prevent prohibited use:
- **Action tier model**: T0-T5 classification with automatic blocking of T5 (forbidden) actions
- **Validation envelope**: every AI proposal is validated against schema, evidence, and policy before execution
- **Abstain-and-escalate**: agents refuse to act when evidence is weak or use case is unclear
- **Audit trail**: every action is logged with full context for compliance review
- **RBAC**: role-based access prevents unauthorized configuration changes

## 5. Customer Responsibility

Customers are responsible for:
- Ensuring their use of NestFleet complies with this AUP and applicable laws
- Training their team members on permitted and prohibited uses
- Monitoring their NestFleet installation for compliance
- Reporting any suspected prohibited use to NestFleet support

## 6. Enforcement

Violation of this AUP may result in:
- License suspension or revocation
- Requirement to cease the prohibited use immediately
- Contractual remedies as specified in the NestFleet license agreement

---

**IMPORTANT**: This is an engineering-informed draft. It must be reviewed by qualified legal counsel before publication.
