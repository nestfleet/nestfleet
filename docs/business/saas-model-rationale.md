# NestFleet SaaS Model — Rationale & Honest Assessment

> **Status:** Decision confirmed 2026-03-30 (NF-PIVOT)
> **Context:** AGPL open-source + SaaS-first pivot. PlatformCloud frozen. Stripe wired directly.
> **Related:** `docs/active/active-backlog.md §12`, `docs/specs/saas-fleet-provisioning.md`

---

## 1. The four DocuGardener SaaS arguments — applied to NestFleet

DocuGardener established four honest SaaS value propositions after evaluating its self-hosted
economics. This document assesses whether each holds for NestFleet, and where NestFleet
diverges.

---

### 1.1 Zero ops — **STRONGER for NestFleet than DocuGardener**

DocuGardener self-hosted is: 1 web service + GitHub App + 1 LLM key.

NestFleet self-hosted at any real scale is:
- PostgreSQL 16 + pgvector (embeddings, requires tuning)
- pg-boss worker queue (5+ background workers: triage, auto-reply, steward,
  pr-draft-prep, known-issue-match)
- Email transport (SMTP or Resend/Postmark + DKIM/SPF DNS records)
- Webhook endpoints for every channel (GitHub, Telegram, contact form, chat SSE)
- Multiple LLM providers with token budget management across every pipeline stage
- pg-boss singleton race condition (known failure mode — fixed in eval, recurs on
  misconfigured deployments)

A NestFleet self-hoster is not managing a server — they are managing a multi-process
queue-backed AI pipeline that their customers' customers are actively waiting on.
The 2am incident is not "my docs drift check stopped running." It is "my customers
are not getting support responses."

**Zero ops is the #1 NestFleet SaaS argument. It is stronger here than in DG.**

---

### 1.2 Bundled LLM — **STRONGER for NestFleet than DocuGardener**

DocuGardener: ~1 LLM call per drift analysis event.

NestFleet per case: triage phase 1 + triage phase 2 + known-issue match + auto-reply
phase 1 + auto-reply phase 2 + steward + optionally PR-draft-prep = **5–7 LLM calls per
case**. At any real volume this is real money, real quota management, and real risk of
provider outages silently breaking the support pipeline.

On SaaS: bundled LLM means the customer gets a working support pipeline on day 1,
NestFleet handles provider failover, and cost-per-case is visible in the analytics tab
without any setup.

**Bundled LLM is a stronger value prop here. First-class SaaS differentiator.**

---

### 1.3 One-click install — **DOES NOT APPLY**

This argument is DocuGardener-specific. DG is a GitHub App — it lives on GitHub
Marketplace, developers install it in one click, GitHub handles OAuth, billing, and
discovery.

NestFleet is not a GitHub App. It has no equivalent single "install" surface. This
argument cannot be made and should not appear on the landing page.

**What NestFleet needs instead:** a signup flow where time-to-first-case is under
10 minutes. Create account → name your product → forward one email address → first case
lands. The Channels Hub onboarding spec (`docs/specs/onboarding-channels-hub-refactor.md`)
is the execution mechanism. It is not optional UX polish — it is the distribution
mechanism.

---

### 1.4 DPA and compliance — **STRONGER for NestFleet, but cuts both ways**

DocuGardener processes code and documentation structure. Low PII risk.

NestFleet processes support conversations — customer names, emails, problem descriptions,
infrastructure details, and sometimes security incident details. This is PII in every
case. FinTech and MedTech teams running NestFleet on SaaS need a signed DPA before
they can legally proceed.

On SaaS: they sign NestFleet's DPA. Done.
On self-hosted: they are the data processor. They write their own DPA for their own
infrastructure. Many enterprise and regulated teams **prefer** self-hosted precisely
to own the compliance scope — it removes NestFleet from their vendor list entirely.

**This argument is real for mid-market teams who want someone else to handle compliance.
Do not use it to push enterprise/regulated customers toward SaaS — they will resist.
Self-hosted is the right offer for that segment.**

---

## 2. The new risk DocuGardener does not have

DocuGardener processes code. GitHub already has that code. Most companies accept a
documentation tool having code access.

NestFleet processes support conversations. These contain customer PII, infrastructure
details, pricing discussions, and incident reports. For a material segment of the ICP
this is a blocker for SaaS adoption — not a checkbox.

**Consequences:**
- Privacy story must be explicit and prominent: data location, access policy, no
  training use (this must be unconditional — not "by default")
- Self-hosted is not a loss leader — it is the product for regulated and enterprise
  customers, who are the highest-value accounts
- AGPL handles this cleanly: community self-hosts free; enterprise pays for a commercial
  license or managed SaaS with SOC 2 documentation

---

## 3. The moat in the AGPL model

Feature-gating is not the moat. An AGPL self-hoster has the full source. The moat is:

| Moat layer | Description |
|------------|-------------|
| **Ops complexity** | Self-hosting NestFleet at scale is genuinely hard. Five workers, pg-boss, pgvector, multi-channel webhooks. The beta eval surfaced the pg-boss singleton race condition — a non-obvious failure mode requiring operational knowledge to diagnose. |
| **Managed LLM** | No token budget anxiety, no provider quota incidents, no API key setup. NestFleet handles failover and cost attribution per case. |
| **Time to first value** | Email forwarding configured in 2 minutes on SaaS vs. 45-minute self-hosted setup minimum. |
| **Support data trust** | For teams that can use SaaS: NestFleet is the ops team for their ops team. They get SLAs, backups, monitoring — not their problem. |

---

## 4. Decision

The AGPL + SaaS-first model is correct for NestFleet for the same structural reasons
as DocuGardener, plus NestFleet-specific ones listed above.

**One constraint to hold:** NF-PIVOT-08 (landing page + signup flow) and the Channels
Hub onboarding (`docs/specs/onboarding-channels-hub-refactor.md`) must ship together.
The SaaS offer has no advantage over self-hosting without a smooth "time to first case"
experience. These are co-dependent deliverables, not sequential ones.
