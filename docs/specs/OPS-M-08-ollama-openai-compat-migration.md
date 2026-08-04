# OPS-M-08 — Migrate Ollama/Self-Hosted Provider to OpenAI-Compat

> **Status:** Spec — not started
> **Size:** L
> **Priority:** P2
> **Blocks / unblocks:** Dependabot PRs #170 (`ai` 6→7), #175 (`@ai-sdk/openai` 3→4), #176 (`@ai-sdk/google` 3→4), #164 (`@ai-sdk/anthropic` 3→4) — all currently deferred pending this migration.
> **Closes:** OPS-M-03 (`ollama-ai-provider` CVE monitoring entry) by removing the dependency.

---

## Problem

NestFleet lets customers bring their own LLM provider (`openai`, `azure-openai`, `anthropic`, `google`, `ollama`, `self-hosted`). The provider factory in `src/agents/llm-provider.ts` routes the `ollama`/`self-hosted` case through `createOllama()` from the `ollama-ai-provider@1.2.0` package.

That package is stuck on an old AI SDK provider spec — it hardcodes `this.specificationVersion = "v1"` — with no upstream fix. This is tracked separately as **OPS-M-03** (low-severity CVE, monitoring, no fix available).

As of 2026-08-04, this dependency is actively blocking the AI SDK v7 upgrade quartet (Dependabot PRs #170, #175, #176, #164). A prior investigation confirmed:

- `tsc --noEmit` and the full unit suite (1509 tests) both pass with the quartet installed on a throwaway branch — but this is a **false green**. A pre-existing `as unknown as LanguageModel` cast at `llm-provider.ts:172` silences what used to be a compile error, and `tests/unit/agents/llm-provider.test.ts` fully `vi.mock()`s `ollama-ai-provider`, so neither check exercises the real return shape.
- At runtime, `ai@7`'s model resolver only accepts spec `"v3"`/`"v4"` and throws `UnsupportedModelVersionError` for anything else. Merging the quartet as-is would deploy clean through CI and then hard-crash in production the instant any product configured with `provider: "ollama"` or `"self-hosted"` runs an agent job (triage, auto-reply, outage-routing, etc.).

The quartet PRs have been deferred with this finding; `ollama-ai-provider@1.2.0` remains in place today.

---

## Solution

Replace the `ollama-ai-provider`-based construction of the ollama/self-hosted model with NestFleet's existing OpenAI-compatible provider path, since Ollama's `/v1` endpoint is OpenAI-compatible and `@ai-sdk/openai@4` already speaks spec-v3/v4. This was already validated in a prior spike (`docs/reference/ollama-structured-output-compat.md`, validated 2026-06-30 against a live Ollama 0.30.10 + qwen2.5-coder:7b using `ai@7.0.2` + `@ai-sdk/openai@4.0.4`): plain text generation and strict structured-output generation both work correctly through Ollama's OpenAI-compatible endpoint.

Once this lands, the deferred AI SDK v7 quartet (#170, #175, #176, #164) can be merged without the runtime crash risk, since `ollama-ai-provider` will no longer be in the dependency tree.

**Scope of the change:**

1. **Provider construction** — in `buildModel()` (`src/agents/llm-provider.ts`), replace the `"self-hosted"`/`"ollama"` branch's use of `createOllama()` with NestFleet's OpenAI-compatible provider construction, pointed at the configured Ollama base URL. Remove the `as unknown as LanguageModel` cast once the branch returns a real spec-v3/v4 model and type-checks cleanly.
2. **Dependency removal** — drop `ollama-ai-provider` from `package.json` entirely. This closes OPS-M-03.
3. **Unblock the quartet** — once the migration lands, merge the four held Dependabot PRs (#170 `ai`, #175 `@ai-sdk/openai`, #176 `@ai-sdk/google`, #164 `@ai-sdk/anthropic`), since they are only held on this dependency.
4. **Structured-output hardening** — Ollama's llama.cpp grammar enforces JSON shape/types/enums but not numeric `min`/`max`, regex, or zod `.refine()`. This affects four schemas in this codebase that currently use `confidenceScore: z.number().min(0).max(1)` (`src/agents/impl/outage-routing.ts`, `change-prep.ts`, `known-issue-match.ts`) and `z.array(z.number().int().min(1).max(4))` (`auto-reply.ts`). A prior spike measured 5/6 valid outputs over 6 runs with the unenforceable constraint present. Decide and implement a hardening approach — relying on the existing `AI_NoObjectGeneratedError` retry in `run-agent.ts`, relaxing the affected schemas and clamping/normalizing the value in code after generation, or both.
5. **Test coverage** — update `tests/unit/agents/llm-provider.test.ts`, which currently mocks `ollama-ai-provider` directly, to mock the OpenAI-compat provider construction for the ollama/self-hosted branch instead, so the test actually exercises the real code path shape.
6. **Live verification** — this is a provider-spec change, so it must be verified against a live Ollama instance before merge, exercising the real `getLlmProviderForProduct` code path (not a standalone script), per the standing rule that green CI alone is not sufficient for provider-spec changes.

This is an internal provider-construction swap, not a config surface change. `LLM_BASE_URL`, `LLM_PROVIDER`, `LLM_API_KEY` env vars and the DB-driven `product.llm_config.provider === "ollama"|"self-hosted"` path must keep working identically from the console/API caller's perspective. No new env vars or compose/Caddyfile changes are expected — this must be verified explicitly as part of the work, not assumed.

---

## Why not wait for a maintained ollama-ai-provider fork

The maintained native fork (`ollama-ai-provider-v2`) hits the identical structured-output gap (it is an Ollama backend/grammar limitation, not an SDK or shim bug), so waiting for it buys nothing on reliability — only a marginally cleaner integration. It also hard-requires `zod@^4.0.16` as a peer dependency, which would force an unwanted zod v3→v4 migration across every schema in the codebase. The OpenAI-compat route avoids both problems.

---

## Testing Plan — closing the gaps that let a "false green" ship

The quartet's near-miss happened because the existing suite couldn't distinguish "type-checks and passes" from "actually works." This migration must not create a new version of the same gap. Concrete additions, derived from reading the current test files and the SDKs involved (not generic advice):

**1. Two real behavior changes in `createOpenAI`'s defaults vs. `ollama-ai-provider`'s — both need an explicit guard + test, not just a swap:**

- **`apiKey` fallback.** `buildModel()`'s pattern today is `if (apiKey) opts.apiKey = apiKey` — when unset, `opts.apiKey` stays `undefined`. For the `openai`/`azure-openai` branches that's fine: `createOpenAI` falls back to reading `process.env.OPENAI_API_KEY` (confirmed at `node_modules/@ai-sdk/openai/dist/index.js:6883-6887`, via `loadApiKey`). For the ollama/self-hosted branch, that fallback is a real risk: if the instance happens to have `OPENAI_API_KEY` set (e.g. another product on the same instance uses OpenAI), a self-hosted-configured product would silently authenticate against whatever `baseURL` resolves to using that key — not fail loudly. The branch must always pass a non-empty placeholder (e.g. `apiKey ?? "ollama"`), never leave it `undefined`.
  - **Test:** unit test asserting that when no `apiKey` is configured for `provider: "ollama"`/`"self-hosted"`, the `createOpenAI` mock is called with a non-empty `apiKey`, regardless of whether `process.env.OPENAI_API_KEY` is set in the test environment. Explicitly set `OPENAI_API_KEY` in the test to prove the ollama path doesn't pick it up.
- **`baseURL` default.** `ollama-ai-provider` defaults to `http://127.0.0.1:11434/api` when `baseURL` is unset (confirmed at `node_modules/ollama-ai-provider/dist/index.js:768`) — a safe local default that just fails to connect if nothing's listening. `createOpenAI` defaults to `https://api.openai.com/v1` (confirmed at `node_modules/@ai-sdk/openai/dist/index.js:6879`) — a **live external endpoint**. If the ollama/self-hosted branch is swapped to `createOpenAI` without also defaulting `baseURL` to a local address, a self-hosted product with no `baseUrl` configured would silently start sending requests to real OpenAI instead of failing safely.
  - **Test:** unit test asserting that when no `baseUrl` is configured for `provider: "ollama"`/`"self-hosted"`, the branch passes an explicit local default (e.g. `http://127.0.0.1:11434/v1`) to `createOpenAI`, never leaving `baseURL` unset.

**2. `tests/unit/agents/llm-provider.test.ts` rewrite** — NF-UNIT-325 and its self-hosted-alias variant currently assert `createOllama` was called; rewrite to assert `createOpenAI` was called for the ollama/self-hosted branch with the two guards above, mirroring the existing NF-UNIT-320/321 assertions for the openai branch. Keep NF-UNIT-337/338/361/362 (capability registry, DB-driven `supportsTools: false`) unchanged — those are orthogonal to provider construction and shouldn't need touching, which is itself worth confirming (a diff limited to the construction tests, not the capability ones, is a good signal the refactor stayed scoped).

**3. Retry logic gap in `run-agent.ts` — currently untested for the exact failure mode this migration exposes.** `tests/unit/agents/run-agent.test.ts`'s `"retry on structured output truncation (AI_NoObjectGeneratedError)"` suite (NF-UNIT-360…363) only models **truncation** (retry doubles output budget, per the code comment at `run-agent.ts:177-179`, "ran out of output tokens mid-JSON"). But the compat doc's measured Ollama failure mode is different: the model produces a **complete, grammar-valid** response where a numeric field is simply out of the zod `min`/`max` range (e.g. `confidence: 95` for `.min(0).max(1)`) — `generateObject` throws the same `AI_NoObjectGeneratedError`, but doubling the output budget does nothing for it (the response wasn't truncated); a retry only helps by chance, via a re-roll. This distinction isn't tested today because it's never been reachable — `ollama-ai-provider` is mocked out, so no test exercises a real schema-validation-shaped failure.
   - **If the hardening decision (spec item 4) is retry-only:** add a test that mocks `generateObject` throwing `AI_NoObjectGeneratedError` where the underlying cause is schema validation (not truncation) and confirms the retry path still behaves sanely (doesn't loop forever, still surfaces `StructuredOutputError` on repeated failure) — don't let the existing truncation-only tests stand in for this case implicitly.
   - **If clamp/normalize-in-code is implemented:** each of the four affected files (`outage-routing.ts`, `change-prep.ts`, `known-issue-match.ts`, `auto-reply.ts`) needs a focused unit test on the clamp function directly, covering boundary and out-of-range inputs (e.g. `confidence: 95` → clamps/normalizes to `1` or `0.95`; `confidence: -5` → clamps to `0`; for `auto-reply.ts`'s `z.array(z.number().int().min(1).max(4))`, an out-of-range array element clamps per-element, not just the whole array rejected).

**4. Integration coverage** — check whether `tests/integration/agent-runs.test.ts` currently runs any case with `provider: "ollama"` or `"self-hosted"` end-to-end (DB → `getLlmProviderForProduct` → `buildModel` → `runAgent`'s `supportsTools: false` single-phase override). If not, add one (LLM call itself still mocked/stubbed at the SDK boundary — testcontainers here is Postgres-only, not a live model) so the wiring between the new provider construction and the existing single-phase-override logic is proven together, not just each piece in isolation.

**5. Mandatory live-Ollama verification (already an acceptance criterion) — elaborate what it must actually exercise,** not just "does it connect":
   - Confirm `model.specificationVersion` resolves to `"v3"`/`"v4"` at runtime against the real returned model object — this closes the loop on the actual root cause, not just a proxy for it.
   - Run all **four real production schemas** (`outage-routing`, `change-prep`, `known-issue-match`, `auto-reply`), not the compat doc's generic example schema — the exact zod shapes matter for grammar-enforceability.
   - Exercise the `supportsTools: false` single-phase path specifically, since that's the default (and likely majority) code path for ollama/self-hosted, not just a generic `generateText` call.
   - Re-measure the reliability numbers (compat doc found 5/6 valid over 6 runs with `min`/`max` present) against whatever hardening approach was chosen, so the acceptance criterion has a number attached, not just "seems to work."

**6. Regression guard against this exact class of bug recurring** — worth adding independent of this migration: a lightweight unit test (or eslint rule) asserting `src/agents/llm-provider.ts` contains no `as unknown as` casts. That escape hatch is precisely what let the v1-vs-v3/v4 spec mismatch pass `tsc --noEmit` undetected for the whole quartet; a test that fails loudly if the pattern reappears prevents the next provider bump from hiding the same class of failure behind a "successful" type-check.

---

## Acceptance Criteria

- [ ] `buildModel()`'s `"self-hosted"`/`"ollama"` branch no longer imports or calls `ollama-ai-provider`
- [ ] `ollama-ai-provider` is removed from `package.json` (and lockfile)
- [ ] The `as unknown as LanguageModel` cast at the ollama/self-hosted branch is removed and the code type-checks without it
- [ ] `LLM_BASE_URL` / `LLM_PROVIDER` / `LLM_API_KEY` env var behavior is unchanged for the ollama/self-hosted case, verified explicitly
- [ ] The DB-driven `product.llm_config.provider === "ollama"|"self-hosted"` path is unchanged, verified explicitly
- [ ] `tests/unit/agents/llm-provider.test.ts` mocks the OpenAI-compat provider construction (not `ollama-ai-provider`) for the ollama/self-hosted case
- [ ] Unit test proves the ollama/self-hosted branch never falls through to `process.env.OPENAI_API_KEY` when no `apiKey` is configured (explicitly set the env var in the test to prove it's not picked up)
- [ ] Unit test proves the ollama/self-hosted branch defaults `baseURL` to a local address (e.g. `http://127.0.0.1:11434/v1`), never to `createOpenAI`'s real `https://api.openai.com/v1` default, when no `baseUrl` is configured
- [ ] A structured-output hardening decision is made and implemented for the four affected schemas (`outage-routing.ts`, `change-prep.ts`, `known-issue-match.ts`, `auto-reply.ts`), with dedicated unit tests for whichever approach is chosen (retry-path test for a schema-validation-caused `AI_NoObjectGeneratedError`, and/or clamp-function tests with boundary/out-of-range inputs)
- [ ] `tests/integration/agent-runs.test.ts` exercises an ollama/self-hosted product end-to-end (DB config → provider construction → `supportsTools: false` single-phase override), added if not already covered
- [ ] Migration is verified against a live Ollama instance through the real `getLlmProviderForProduct` code path (not a standalone script) before merge, exercising all four real schemas and the single-phase path, with `model.specificationVersion` confirmed at runtime and reliability numbers re-measured
- [ ] Full unit suite, integration suite, and `tsc --noEmit` pass with `ollama-ai-provider` removed
- [ ] Dependabot PRs #170, #175, #176, #164 are merged after this migration lands, confirmed no longer blocked
- [ ] OPS-M-03 backlog entry is marked resolved/superseded, pointing to this item
- [ ] No new env vars introduced; no `docker-compose.yml` / `docker-compose.prod.yml` / `docker-compose.customer.yml` / Caddyfile changes required — confirmed, not assumed

---

## Out of Scope

- Migrating to the maintained `ollama-ai-provider-v2` fork (rejected — see rationale above; also forces an unwanted zod v3→v4 migration)
- A general zod v3→v4 migration across the codebase
- Adding new customer-facing configuration options for Ollama/self-hosted setup
- Fixing Ollama's llama.cpp grammar engine itself (out of NestFleet's control — this is a confirmed upstream Ollama limitation, not an SDK bug)
- Any change to the `openai`, `azure-openai`, `anthropic`, or `google` provider branches beyond what's needed to keep the AI SDK v7 quartet compiling

---

## Size & Priority

Size: L | Priority: P2

Cross-domain: shared agent code (`llm-provider.ts`), four agent-schema files, one test file, a dependency removal, and a mandatory live-Ollama verification step before merge. Priority P2 — nothing is on fire; the quartet PRs are deferred, not urgent. Note: this item also unblocks 4 stuck Dependabot PRs (#170, #175, #176, #164) once shipped.
