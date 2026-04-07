# Product Suite Strategy: NestFleet + DocuGardener

> Decision date: 2026-03-20
> Status: **Accepted**
> Decision: **Option C — Suite play** (two products, shared platform, deep integration)

---

## 1. Context

As NestFleet matured through v1 delivery, a pattern emerged: many features built for support operations (knowledge management, doc-gap detection, content lifecycle) overlap with DocuGardener's core domain. This raised the question: should DocuGardener be absorbed into NestFleet as a feature module, or remain a separate product?

Three options were evaluated:

| Option | Description | Verdict |
|--------|-------------|---------|
| **A — Merge** | DocuGardener becomes a NestFleet module (e.g., "Knowledge Studio") | Rejected |
| **B — Isolate** | Two fully independent products, no shared layer | Rejected |
| **C — Suite** | Two products, shared PlatformCloud layer, deep integration bridge | **Accepted** |

## 2. Strategic Rationale

### 2.1 Why not merge?

| Concern | Detail |
|---------|--------|
| **Buyer persona divergence** | NestFleet's buyer is **Head of Support / Engineering Lead** (pain: ticket overload, triage fatigue). DocuGardener's buyer is **Head of Product / DevRel / Tech Writing Lead** (pain: docs always stale, nobody owns them). Merging forces one product to speak to two distinct pains. |
| **TAM contraction** | Companies without a support problem still have a documentation problem. A merged product cannot be sold to doc-only buyers. |
| **Pricing leverage lost** | Two products = land with one, expand to the other. One product = single price point, no expansion motion. |
| **Feature bloat risk** | NestFleet's "Hammer, Not Whale" principle (product-vision.md §5.6) explicitly rejects becoming an enterprise mega-suite. Absorbing DocuGardener pushes toward whale territory. |

### 2.2 Why not fully isolate?

| Concern | Detail |
|---------|--------|
| **Duplicated infra** | Both products need auth, billing, licensing, agent framework, LLM config, notification system. Two separate stacks doubles the maintenance surface for a solo operator. |
| **Broken feedback loop** | Support cases often reveal documentation gaps. If the products don't talk, this insight is lost — the exact problem both products exist to solve. |
| **Weaker narrative** | "Two unrelated tools from the same company" is harder to sell than "an integrated suite that closes the support-to-documentation loop." |

### 2.3 Why the suite play wins

| Advantage | Detail |
|-----------|--------|
| **Land and expand** | Sell NestFleet to support-heavy teams. Sell DocuGardener to doc-heavy teams. Cross-sell the integration: "Your docs are always stale because support insights never reach the doc team — the suite closes that loop automatically." |
| **Higher combined ACV** | Two products bundled at a discount outprice one product with more features. |
| **Independent growth trajectories** | Each product can evolve at its own pace. DocuGardener can chase the dev-docs market without being constrained by NestFleet's support-ops roadmap. |
| **Shared operational layer** | PlatformCloud (auth, billing, licensing, product registry) already supports multi-product architecture (`PRODUCT_REGISTRY` in `PlatformCloud/src/license/validator.ts`). |
| **The Atlassian precedent** | Jira + Confluence: deeply integrated, separate products, separate pricing. The integration IS the selling point. |

## 3. Product Identities

### 3.1 NestFleet

> **"Your Sovereign AI Product Operations Team"**

Core domain: support signal intake, triage, case management, change management (CR → PR → deploy), compliance, analytics.

Buyer: Head of Support, Engineering Lead, Technical Founder.

Value prop: "Stop manually triaging tickets into GitHub. Let your virtual team draft the PR for you."

### 3.2 DocuGardener

> **"AI-Powered Documentation Quality Engine"**

Core domain: documentation health monitoring, stale-doc detection, automated update proposals, review workflows, multi-format publishing, doc coverage analytics.

Buyer: Head of Product, Developer Relations, Tech Writing Lead, Documentation Manager.

Value prop: "Your docs stay accurate without anyone manually checking. DocuGardener watches your product, detects when reality drifts from documentation, and proposes fixes for your team to approve."

### 3.3 The Suite

> **"NestFleet Suite — Support + Documentation, One Closed Loop"**

Combined value prop: "Support insights feed documentation updates. Documentation quality reduces support volume. The loop closes automatically."

## 4. Shared Platform Layer (PlatformCloud)

Both products connect to PlatformCloud for:

| Capability | Implementation |
|-----------|----------------|
| **SSO / Auth** | Shared JWT issuer, single login across both products |
| **Billing** | Stripe integration, bundle pricing, per-product Outcome Units |
| **Licensing** | `PRODUCT_REGISTRY` feature matrix per product, shared license validation endpoint |
| **Product switcher** | Console sidebar shows both products with quick-switch navigation |
| **Update channel** | NestFleet Cloud delivers updates, benchmarks, compliance templates to both |

## 5. Integration Bridge

The integration between NestFleet and DocuGardener is the suite's core differentiator. See [`specs/nestfleet-docugardener-integration.md`](./specs/nestfleet-docugardener-integration.md) for the full technical specification.

**Key integration points (summary):**

| # | Flow | Direction | Trigger |
|---|------|-----------|---------|
| 1 | **Doc gap signal** | NestFleet → DocuGardener | NestFleet triage detects a documentation gap during case analysis |
| 2 | **Doc update proposal** | DocuGardener → NestFleet | DocuGardener proposes a doc update; NestFleet's knowledge base reflects it |
| 3 | **Knowledge refresh** | DocuGardener → NestFleet | DocuGardener publishes an update; NestFleet's RAG index auto-refreshes |
| 4 | **Support deflection metric** | NestFleet → DocuGardener | Cases deflected by improved docs are attributed to DocuGardener |
| 5 | **Shared lineage** | Bidirectional | NestFleet lineage graph shows DocuGardener events as external references |
| 6 | **Unified notifications** | Bidirectional | Cross-product notification feed in the console |

## 6. Go-to-Market Motion (Updated)

### 6.1 Phase 1: Prove with pilots (current)

Use DocuGardener on its own documentation and NestFleet on its own support ops. Generate real case studies:
- "Signal-to-PR" story (NestFleet)
- "Stale-to-Fresh" story (DocuGardener)
- "Support-to-Docs loop" story (Suite)

### 6.2 Phase 2: Developer-led adoption

| Channel | NestFleet | DocuGardener | Suite |
|---------|-----------|--------------|-------|
| **GitHub Marketplace** | Self-hosted support ops template | Self-hosted doc-quality template | Combined template |
| **Product Hunt** | "AI support team in your VPC" | "AI doc gardener in your VPC" | Bundle launch |
| **Conference talks** | "Zero-triage support ops" | "Documentation that updates itself" | "The closed loop" |
| **Content** | Blog: support → PR automation | Blog: doc freshness scoring | Blog: how stale docs cause support tickets |

### 6.3 Phase 3: Pricing tiers

| Tier | NestFleet | DocuGardener | Suite (bundle) |
|------|-----------|--------------|----------------|
| **Trial** | 30 days, 1 product, 100 OU/mo | 30 days, 1 repo, 50 OU/mo | Both trials unified |
| **Starter** | 1 product, 500 OU/mo | 1 repo, 250 OU/mo | Both at 15% discount |
| **Growth** | 3 products, 2000 OU/mo | 5 repos, 1000 OU/mo | Both at 20% discount |
| **Scale** | Unlimited products, custom OU | Unlimited repos, custom OU | Both at 25% discount + priority support |

Bundle discount is the expansion lever: "You're already on NestFleet Starter — add DocuGardener for just 85% of its standalone price."

### 6.4 Land-and-expand playbook

```
                    ┌─────────────────────────────┐
                    │     Customer enters via:     │
                    │  NestFleet  OR  DocuGardener  │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  Month 1-3: Single product   │
                    │  value proven (case studies)  │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  Trigger: "We notice your    │
                    │  support cases keep hitting  │
                    │  documentation gaps" (or      │
                    │  vice versa)                  │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  Cross-sell the other product │
                    │  with the integration story   │
                    │  + bundle discount             │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │  Suite customer: higher ACV,  │
                    │  stickier retention, closed   │
                    │  feedback loop                │
                    └─────────────────────────────┘
```

## 7. Success Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Cross-sell rate | 30% of single-product customers adopt the other within 6 months | Proves the integration story resonates |
| Suite retention vs. single-product | Suite churn < 50% of single-product churn | Integration creates stickiness |
| Doc-gap-to-update cycle time | < 48 hours (with suite) vs. "never" (without) | Core value prop of the closed loop |
| Support deflection from doc updates | 15% of recurring case types eliminated per quarter | Proves the loop actually works |

## 8. Engineering Implications for Solo Operator

| Concern | Mitigation |
|---------|------------|
| Two products to maintain | Shared PlatformCloud handles auth, billing, licensing. Shared agent framework extractable as npm package. |
| Two deployment pipelines | Monorepo option: `nestfleet/`, `docugardener/`, `platformcloud/` — single CI, separate deploys |
| Two consoles | Shared design system (NestFleetKit). Product switcher in sidebar. |
| Two sets of tests | Shared test utilities. Integration tests cover the bridge. |

## 9. Open Questions

- [ ] Should DocuGardener share the same PostgreSQL instance in a customer's deployment, or maintain its own?
- [ ] Should the integration bridge be synchronous (API calls) or asynchronous (event bus)?
- [ ] Should there be a free tier for DocuGardener to maximize adoption for the cross-sell funnel?
- [ ] Should the product switcher live in PlatformCloud's portal or in each product's console?
