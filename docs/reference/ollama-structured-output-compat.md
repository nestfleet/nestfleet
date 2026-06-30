# Ollama structured-output compatibility (OpenAI-compat vs native)

**Status:** Validated 2026-06-30 against live Ollama 0.30.10 + `qwen2.5-coder:7b`,
using `ai@7.0.2` + `@ai-sdk/openai@4.0.4`.
**Why this exists:** historical compatibility problems when driving Ollama through
an OpenAI-compatible endpoint were only recorded as scattered code comments
(`llm-provider.ts` "native Gemini SDK eliminates OpenAI-compat shim quirks") and
backlog notes. This consolidates the actual behaviour and its root cause, and
informs whether **Option 2** of the AI SDK v7 epic (route Ollama via
`createOpenAI({ baseURL })` instead of a dedicated Ollama provider) is viable.

## What works now (improvement vs early 2026)

With the current SDK pointed at Ollama's `/v1` endpoint
(`createOpenAI({ baseURL: "http://<host>:11434/v1", apiKey: "ollama" })`):

| Path | Result |
|------|--------|
| `generateText` plain chat (`model()` and `.chat()`) | ✅ works |
| `generateText` + `Output.object({ schema })` — **strict `json_schema`** (SDK default) | ✅ works for structure / types / enums |
| `generateText` + `Output.object` with `structuredOutputs: false` (json mode) | ❌ unreliable — model returns loosely-typed JSON |

Direct `curl` to `/v1/chat/completions` with `response_format:{type:"json_schema",strict:true}`
returns clean schema-shaped JSON, so **the endpoint itself honours `json_schema`.**

## The remaining limitation (root cause)

Ollama constrains generation with a **llama.cpp grammar** compiled from the JSON
Schema. A grammar can enforce **shape, types, required keys, and enums**, but it
**cannot enforce** constraints that aren't structurally expressible:

- numeric `minimum` / `maximum` (e.g. `z.number().min(0).max(1)`)
- string `format` / `pattern` / regex
- any zod `.refine()` / cross-field rule

So the model may emit a value that satisfies the grammar (it *is* a number) but
violates the zod schema (e.g. `confidence: 95` for a `min(0).max(1)` field). zod
then rejects it → `AI_NoObjectGeneratedError`.

**Measured reliability** (6 runs each, strict `json_schema`, qwen2.5-coder:7b):

| Schema | Valid |
|--------|-------|
| `confidence: z.number().min(0).max(1)` | **5/6** (one run returned `95`) |
| `confidence: z.number()` (no range) | **6/6** |

## Impact on NestFleet's agent schemas

Our agent output schemas **do** use grammar-unenforceable constraints, so they are
exposed to intermittent validation failures on Ollama:

- `src/agents/impl/outage-routing.ts` — `confidenceScore: z.number().min(0).max(1)`
- `src/agents/impl/change-prep.ts` — same
- `src/agents/impl/known-issue-match.ts` — same
- `src/agents/impl/auto-reply.ts` — `z.array(z.number().int().min(1).max(4))`

`run-agent.ts` already wraps `generateObject`/structured calls in a retry for
`AI_NoObjectGeneratedError`, which masks most single-run failures, and the
`ollama`/`self-hosted` providers run `supportsTools: false` (single-phase), so the
only Ollama path is exactly this structured-output call.

## Crucial: native provider has the **same** limitation

This is an **Ollama backend** limitation (the grammar engine), not an SDK or
OpenAI-compat-shim bug. The maintained native provider we'd otherwise wait for
(`ollama-ai-provider-v2`) drives the same Ollama backend, so it has the **same**
range/refinement gap. Waiting for it buys a *cleaner integration*, **not** better
structured-output reliability.

## Recommendation for Option 2 (route Ollama via OpenAI-compat)

**Viable.** It unblocks the `ai` v7 migration today without waiting on
`ollama-ai-provider-v2`, because the OpenAI-compatible provider (`@ai-sdk/openai@4`)
already supports `ai`@7 (provider spec v4). To make Ollama robust regardless of
route, do one of:

1. **Keep the existing retry** (already present) — cheapest; tolerate occasional
   re-asks.
2. **Make schemas Ollama-friendly** — drop unenforceable `.min/.max` on the
   model-facing schema, then **clamp/normalize in code** (e.g. `confidence = min(1, max(0, raw > 1 ? raw/100 : raw))`).
3. **Both** — friendliest for self-hosters.

The historical "OpenAI-compat doesn't work for Ollama" is now **mostly resolved**
for structured output; the residual issue is the grammar constraint gap above,
which is inherent to Ollama and independent of the provider choice.

### Reproduction
Standalone validation scripts used: `createOpenAI({baseURL:".../v1"})` +
`generateText({ output: Output.object({ schema }) })` against a live Ollama with
`qwen2.5-coder:7b`, varying the schema's numeric constraints and counting valid
parses over N runs. (Run from an isolated dir per the external-service
verification rule; not committed.)
