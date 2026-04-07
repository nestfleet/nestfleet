# Suggested NestFleet Pricing Tiers (Revised March 2026)

This document provides a detailed breakdown of the proposed pricing tiers for NestFleet, incorporating the strategic shift from "Actions" to "Outcomes" and adding a Community entry point.

## 1. Defining the "Outcome Unit" (OU)
To move away from opaque "AI Actions," NestFleet should use **Outcome Units** as the primary volume metric.

**1 Outcome Unit (OU) is consumed for ANY one of the following milestones:**
- 1 Successfully resolved support thread (User confirms resolution or AI auto-resolves a safe case).
- 1 Approved and merged Pull Request draft.
- 1 Verified production release follow-up.

*Example: If a single complex case results in a support resolution, followed by a PR draft, followed by a release verification, that sequence would consume **3 OUs** in total, reflecting the end-to-end workload and value delivered.*

---

## 2. Tier Breakdown

### Tier 0: Community (Free)
**Target**: Individual developers, Open Source projects, and hobbyists.
- **Price**: $0
- **Products**: 1
- **Volume**: 100 OUs per month
- **Channels**: Email only
- **Governance**: Single Human Lead
- **Constraint**: "Powered by NestFleet" signature required; Non-commercial BSL license.

### Tier 1: Starter
**Target**: Solopreneurs and founders with a small product portfolio.
- **Price**: ~$99/month
- **Products**: Up to 3 (The "Portfolio Mini-Pack")
- **Volume**: 1,000 OUs per month
- **Channels (input)**: Email + Website Widget
- **Channels (notifications)**: Email + Telegram
- **Governance**: Up to 3 Human Lead slots; fixed default roles (admin, operator, support_lead, knowledge_lead) — no customization
- **AI Autonomy**: **Confidence-based auto-resolution** — AI auto-resolves cases above a configurable confidence threshold, no human click needed for obvious cases.
- **Features**: Overview metrics + Cost & token tracking, Basic Compliance Templates.
- **RBAC**: Default role set ships locked. Works out of the box, zero configuration required.

### Tier 2: Growth
**Target**: Lean product organizations managing many products/brands.
- **Price**: ~$499/month
- **Products**: Up to 10 (The "Portfolio Pro-Pack")
- **Volume**: 10,000 OUs per month
- **Channels (input)**: Email + Website Widget + **Telegram + Slack**
- **Channels (notifications)**: Email + Telegram + **Slack**
- **Governance**: Unlimited Human Leads
- **AI Autonomy**: **Pattern-based smart auto-resolution** — Known-issue matching + Knowledge Capture enable the AI to recognize *previously solved problems* and apply proven resolutions. **CI auto-complete** (PR merges when CI passes). This is the compounding asset — gets smarter every month.
- **Features**: Full Eval Pipeline (6-tab analytics dashboard), Policy Builder, **Proactive Known-Issue Matching**, GDPR + AI Act compliance templates.
- **RBAC**: **Permission Audit (read-only)** — view the full permission set for each default role. Enables compliance officers to document the access model. Role definitions remain fixed; no editing.
- **Audit**: Structured audit logs (who, what, when, which product).

### Tier 3: Scale / Sovereign
**Target**: High-security, high-volume enterprises (FinTech, MedTech).
- **Price**: Custom (Starting at ~$2,500/month)
- **Products**: Unlimited
- **Volume**: 100,000+ OUs per month
- **Channels (input)**: All — Email, Website Widget, Telegram, Slack + **Discord, Internal Tooling / API**
- **Channels (notifications)**: All — Email, Telegram, Slack + **Discord, internal webhooks**
- **Governance**: Enterprise Grade (SSO, SAML, **full dynamic RBAC**)
- **AI Autonomy**: Everything in Growth + **custom quality benchmarks** (define what "good" means for your organization).
- **Features**: Advanced Audit Logs + SIEM export, Custom Compliance Bundles (DPIA, AI Act maps), Regulatory change alerts, Priority Security Advisories, Dedicated Support.
- **RBAC**: Full **Permission Studio** — customize default role permissions, create bespoke roles from atomic permission blocks, apply user-level overrides, map SSO/SAML groups to roles. Includes GDPR role delegation (grant `dsar:search` / `retention:run` to a DPO role without full admin). Role change audit trail with actor + timestamp.

---

## 3. Strategic Rationale for the Shifts

1.  **3 Products in Starter**: Solopreneurs rarely have just one product; they have a "fleet" of small experiments. Allowing 3 products in the entry tier makes NestFleet the *only* tool that supports this workflow without a per-seat penalty.
2.  **Outcome-Based Volume**: 1,000 "Results" feels high-value. If a founder gets 1,000 resolved issues or PRs for $99, the ROI is undeniable compared to hiring or paying for Intercom's $0.99/res + seat fees.
3.  **Human Lead slots**: Instead of charging per user, we limit the number of "Lead Functions" (e.g., Support Lead, Change Lead). This preserves the "Sovereign Team" narrative while providing a soft cap for larger organizations.
4.  **RBAC as a tier gatekeeper**: Default roles ship with every tier — there is no friction for small teams. Customization is gated at Scale for three reasons: (a) misconfigured roles generate support cost that only Scale's onboarding absorbs; (b) custom roles without SSO group mapping (Scale-only) deliver half the value; (c) "I need an `auditor` role for our DPO" is the exact conversation that signals a Scale-budget organization.

---

## 4. RBAC Permission Tiers at a Glance

| Capability | Community | Starter | Growth | Scale |
|---|:---:|:---:|:---:|:---:|
| Default roles (admin / operator / leads) | ✅ | ✅ | ✅ | ✅ |
| Permission audit view (read-only) | — | — | ✅ | ✅ |
| Customize default role permissions | — | — | — | ✅ |
| Create custom roles (Lego mode) | — | — | — | ✅ |
| User-level permission overrides | — | — | — | ✅ |
| GDPR role delegation (DPO role) | — | — | — | ✅ |
| SSO group → role mapping | — | — | — | ✅ |
| Role change audit trail | — | — | — | ✅ |
| Permission Studio UI | — | — | — | ✅ |

---

## 5. Key Feature Gating Decisions (March 2026 revision)

Changes from the original tier model, reflecting strategic analysis:

1. **Website Widget moved to Starter** (was Growth). A solopreneur's users visit the product website — widget is the most natural support channel after email. More useful at Starter than Telegram.
2. **Telegram input moved to Growth** (was Starter). Telegram as an input channel is a community/team play — fits Growth's "managing multiple products with diverse user bases" profile. Telegram *notifications* remain at Starter (outbound alerts to operators).
3. **Slack (input + notifications) moved to Growth** (was Scale). Operators live in Slack. Gating this at $2,500 was a dealbreaker for mid-market teams. Discord + internal tooling API remain Scale-only.
4. **Confidence-based auto-resolution added to Starter** (was Growth). If someone pays $99 and still has to click "Approve" on every case, the product feels manual. Starter auto-resolves obvious cases (AI confidence > threshold). Growth adds *pattern-based* smart auto-resolution powered by known-issue matching — the compounding intelligence layer.
5. **Cost & token tracking added to Starter** (was Growth). If you're paying $99/month and your LLM bill is $50/month, you need to see that. Basic cost visibility is an operational necessity, not a premium insight.
6. **Analytics dashboard tier-gated**: Community = none. Starter = overview metrics + cost tracking. Growth = full 6-tab dashboard. Scale = custom benchmarks + export.
7. **Knowledge Capture gated at Growth**: The AI's ability to learn from resolved cases and build FAQ/runbooks is a compounding asset. It creates growing deflection capacity — the more you use it, the more valuable it becomes. This is Growth's strongest retention hook.
8. **CI auto-complete gated at Growth**: Starter requires manual merge approval. Growth enables hands-free merge when CI passes.
9. **$199 "Team" tier under evaluation** for post-Phase 3: would surface known-issue matching earlier to reduce the 5× price jump friction. Decision deferred until pilot conversion data is available.

> **Canonical feature matrix**: See `monetization-and-licensing-model.md` section 6.2 for the full feature-per-tier breakdown.
