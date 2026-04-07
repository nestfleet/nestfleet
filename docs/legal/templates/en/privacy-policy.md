# Privacy Policy — NestFleet Managed Service

**Status:** DRAFT — requires review by qualified legal counsel before publication.
**Last updated:** 2026-04-01
**Applies to:** NestFleet managed SaaS (nestfleet.io). Self-hosted deployments are not covered — the operator is the data controller.

---

## 1. Who we are

NestFleet ("we", "us", "our") operates the managed NestFleet service at nestfleet.io.
For data protection enquiries: **privacy@nestfleet.io**

---

## 2. What data we collect and why

### 2.1 Account data
- **Email address, display name, hashed password** — required to create and authenticate your account.
- **Lawful basis (GDPR):** Contract (Art. 6(1)(b)).

### 2.2 Workspace configuration
- LLM provider type and encrypted API keys, GitHub repository URLs, notification settings.
- **Lawful basis:** Contract.

### 2.3 Billing data
- Stripe handles payment processing. We store only the Stripe Customer ID and Subscription ID — no raw card numbers.
- **Lawful basis:** Contract / legal obligation.

### 2.4 Usage telemetry (opt-in)
- Aggregate counts: cases processed, OU consumption, agent action types. No case content.
- **Lawful basis:** Legitimate interest (Art. 6(1)(f)) — service improvement.
- You may opt out at any time via Settings → Product → Telemetry.

### 2.5 Support communications
- If you contact us by email, we retain the correspondence to resolve your request.
- **Lawful basis:** Legitimate interest.

---

## 3. What we do NOT collect

- The **content of support tickets, conversations, or cases** processed by your NestFleet instance. This data lives only in your database.
- LLM prompts or completions sent to your configured LLM provider. We proxy nothing.
- Personal data of your end-users. You are the controller; we are the processor for account/billing data only.

---

## 4. Data storage and transfers

- Account and billing data is stored in PostgreSQL hosted in the EU (Hetzner, Frankfurt).
- Stripe (Stripe Inc., USA) processes payments. Covered by Standard Contractual Clauses.
- If you configure an LLM provider (OpenAI, Anthropic, Google), your prompts go directly from your browser/server to that provider — not through NestFleet's infrastructure.

---

## 5. Retention

| Category | Retention |
|---|---|
| Account data | Until account deletion |
| Billing records | 7 years (legal obligation) |
| Audit logs (your instance) | Per your configured retention window |
| Support emails | 2 years from resolution |

---

## 6. Your rights (GDPR)

You have the right to: access, rectify, erase, restrict, port, and object to processing of your personal data.
Contact **privacy@nestfleet.io** — we respond within 30 days.

For erasure of your account data: Settings → Account → Delete Account, or email us.

---

## 7. Cookies

We use a single session cookie (`nestfleet_token` — JWT, HttpOnly, Secure) to maintain your login session. No analytics or tracking cookies.

---

## 8. Changes to this policy

We will notify you by email at least 14 days before material changes take effect.

---

## 9. Contact and supervisory authority

- **Data controller:** NestFleet [Legal entity TBC]
- **Email:** privacy@nestfleet.io
- **Supervisory authority:** [TBC — Berliner Beauftragte für Datenschutz und Informationsfreiheit, or relevant EU SA]
