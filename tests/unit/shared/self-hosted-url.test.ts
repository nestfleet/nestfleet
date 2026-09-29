/**
 * Unit tests: resolveSelfHostedUrls() — one URL convention for every self-hosted code path
 * (agents, Test Connection, embeddings, list-models).
 *
 * NF-UNIT-SHU-01: unset / blank → local Ollama default
 * NF-UNIT-SHU-02: bare host, trailing slashes → openaiBase gets /v1, nativeBase is the host
 * NF-UNIT-SHU-03: legacy Ollama-native "/api" suffix → treated as the bare host
 * NF-UNIT-SHU-04: explicit "/v1" (any prefix) → openaiBase kept, nativeBase strips /v1
 * NF-UNIT-SHU-05: custom path → used as given for both (never rewritten)
 * NF-UNIT-SHU-06: unparseable input → passed through (request fails visibly, never silently redirected)
 */

import { describe, it, expect } from "vitest"
import { resolveSelfHostedUrls, SELF_HOSTED_DEFAULT_HOST } from "../../../src/shared/self-hosted-url.js"

describe("resolveSelfHostedUrls", () => {
  it.each([undefined, "", "   "])("NF-UNIT-SHU-01: %j → local default, never a remote endpoint", (input) => {
    expect(resolveSelfHostedUrls(input)).toEqual({
      openaiBase: `${SELF_HOSTED_DEFAULT_HOST}/v1`,
      nativeBase: SELF_HOSTED_DEFAULT_HOST,
    })
    expect(SELF_HOSTED_DEFAULT_HOST).toBe("http://127.0.0.1:11434")
  })

  it.each([
    "http://ollama:11434",
    "http://ollama:11434/",
    "http://ollama:11434///",
    "  http://ollama:11434  ",
  ])("NF-UNIT-SHU-02: bare host %j", (input) => {
    expect(resolveSelfHostedUrls(input)).toEqual({
      openaiBase: "http://ollama:11434/v1",
      nativeBase: "http://ollama:11434",
    })
  })

  it.each(["http://ollama:11434/api", "http://ollama:11434/api/"])(
    "NF-UNIT-SHU-03: legacy /api suffix %j → bare host",
    (input) => {
      expect(resolveSelfHostedUrls(input)).toEqual({
        openaiBase: "http://ollama:11434/v1",
        nativeBase: "http://ollama:11434",
      })
    },
  )

  it.each([
    ["http://ollama:11434/v1",             "http://ollama:11434/v1",             "http://ollama:11434"],
    ["http://ollama:11434/v1/",            "http://ollama:11434/v1",             "http://ollama:11434"],
    ["https://gw.example.com/openai/v1",   "https://gw.example.com/openai/v1",   "https://gw.example.com/openai"],
  ])("NF-UNIT-SHU-04: explicit /v1 %s", (input, openaiBase, nativeBase) => {
    expect(resolveSelfHostedUrls(input)).toEqual({ openaiBase, nativeBase })
  })

  it.each([
    "https://gw.example.com/custom",
    "https://gw.example.com/custom/",
    "http://host:8000/v1beta/openai",
  ])("NF-UNIT-SHU-05: custom path %s is never rewritten", (input) => {
    const expected = input.replace(/\/+$/, "")
    expect(resolveSelfHostedUrls(input)).toEqual({ openaiBase: expected, nativeBase: expected })
  })

  it("NF-UNIT-SHU-05: URLs with a query string or fragment are passed through as given", () => {
    const u = "https://gw.example.com/x?key=1"
    expect(resolveSelfHostedUrls(u)).toEqual({ openaiBase: u, nativeBase: u })
  })

  it("NF-UNIT-SHU-06: unparseable input is passed through, not silently replaced", () => {
    expect(resolveSelfHostedUrls("not a url")).toEqual({ openaiBase: "not a url", nativeBase: "not a url" })
  })
})
