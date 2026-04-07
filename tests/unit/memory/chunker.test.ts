/**
 * Unit tests for the structure-aware chunker.
 * Covers chunkMarkdown, chunkOpenAPI, and chunkGitHubItem.
 */

import { describe, it, expect } from "vitest"
import {
  chunkMarkdown,
  chunkOpenAPI,
  chunkGitHubItem,
} from "../../../src/memory/ingestion/chunker.js"

// ── chunkMarkdown ────────────────────────────────────────────────────────────

describe("chunkMarkdown", () => {
  describe("heading-boundary extraction", () => {
    it("produces separate chunks for each top-level section", () => {
      // Each section needs enough prose to survive the 100-char filter after the [Path] prefix
      const intro = "word ".repeat(30)   // ~150 chars
      const start = "word ".repeat(30)
      const md = `# Introduction\n\n${intro}\n\n# Getting Started\n\n${start}\n`
      const chunks = chunkMarkdown(md)
      expect(chunks.length).toBeGreaterThanOrEqual(2)
      const paths = chunks.map((c) => c.sectionPath)
      expect(paths).toContain("Introduction")
      expect(paths).toContain("Getting Started")
    })

    it("captures h2 section path as h1 > h2", () => {
      const prose = "word ".repeat(30)  // enough to survive filter
      const md = `# Overview\n\n## Installation\n\n${prose}\n`
      const chunks = chunkMarkdown(md)
      const installChunk = chunks.find((c) => c.sectionPath === "Overview > Installation")
      expect(installChunk).toBeDefined()
    })

    it("captures h3 section path as h1 > h2 > h3", () => {
      const prose = "word ".repeat(30)
      const md = `# Guide\n\n## Configuration\n\n### Advanced Settings\n\n${prose}\n`
      const chunks = chunkMarkdown(md)
      const deepChunk = chunks.find((c) =>
        c.sectionPath === "Guide > Configuration > Advanced Settings"
      )
      expect(deepChunk).toBeDefined()
    })

    it("uses Root as sectionPath when no heading precedes content", () => {
      const prose = "word ".repeat(30)  // enough to survive filter
      const md = `${prose}\n`
      const chunks = chunkMarkdown(md)
      expect(chunks.length).toBeGreaterThanOrEqual(1)
      expect(chunks[0]!.sectionPath).toBe("Root")
    })
  })

  describe("code block extraction", () => {
    it("emits a code-typed chunk for a fenced code block", () => {
      // The final filter requires content.trim().length >= 100 chars (MIN_PROSE_CHARS).
      // Wrapped content is: ```typescript\n<code>\n``` so the code body itself
      // needs to be long enough to push the total over 100 chars.
      const code = [
        "const x = 42;",
        "const y = x * 2;",
        "const z = y + x;",
        "console.log(x, y, z);",
        "export { x, y, z };",
      ].join("\n")
      const md = `# Usage\n\n\`\`\`typescript\n${code}\n\`\`\`\n`
      const chunks = chunkMarkdown(md)
      const codeChunk = chunks.find((c) => c.contentType === "code")
      expect(codeChunk).toBeDefined()
      expect(codeChunk!.content).toContain("const x = 42;")
      expect(codeChunk!.language).toBe("typescript")
    })

    it("wraps code content with backtick fences in the chunk content", () => {
      const code = [
        'print("hello")',
        'print("world")',
        "x = 1 + 2",
        "print(x)",
        "y = x * 3",
        "print(y)",
        "# end of example code block",
      ].join("\n")
      const md = `# Example\n\n\`\`\`python\n${code}\n\`\`\`\n`
      const chunks = chunkMarkdown(md)
      const codeChunk = chunks.find((c) => c.contentType === "code")
      expect(codeChunk).toBeDefined()
      expect(codeChunk!.content).toMatch(/^```python/)
      expect(codeChunk!.content).toContain('print("hello")')
    })

    it("never splits a code block across chunks — one block equals one chunk", () => {
      const longCode = Array.from({ length: 200 }, (_, i) => `const line${i} = ${i};`).join("\n")
      const md = `# Code\n\nSome introductory prose.\n\n\`\`\`javascript\n${longCode}\n\`\`\`\n`
      const chunks = chunkMarkdown(md)
      const codeChunks = chunks.filter((c) => c.contentType === "code")
      expect(codeChunks).toHaveLength(1)
      expect(codeChunks[0]!.content).toContain("const line199 = 199;")
    })

    it("attaches the enclosing section path to the code chunk", () => {
      const code = "curl -X GET https://api.example.com/users \\\n  -H 'Authorization: Bearer token' \\\n  -H 'Accept: application/json'"
      const md = `# API\n\n## Examples\n\n\`\`\`bash\n${code}\n\`\`\`\n`
      const chunks = chunkMarkdown(md)
      const codeChunk = chunks.find((c) => c.contentType === "code")
      expect(codeChunk).toBeDefined()
      expect(codeChunk!.sectionPath).toBe("API > Examples")
    })

    it("omits language field when code fence has no language tag", () => {
      const code = [
        "plain text block line one",
        "line two here with extra content",
        "line three more content details",
        "line four final line of block",
        "line five additional content here",
      ].join("\n")
      const md = `# Misc\n\n\`\`\`\n${code}\n\`\`\`\n`
      const chunks = chunkMarkdown(md)
      const codeChunk = chunks.find((c) => c.contentType === "code")
      expect(codeChunk).toBeDefined()
      expect(codeChunk!.language).toBeUndefined()
    })
  })

  describe("content hash", () => {
    it("computes a non-empty contentHash for each chunk", () => {
      const prose = "word ".repeat(30)
      const md = `# Section\n\n${prose}\n`
      const chunks = chunkMarkdown(md)
      expect(chunks.length).toBeGreaterThanOrEqual(1)
      for (const chunk of chunks) {
        expect(chunk.contentHash).toBeTruthy()
        expect(chunk.contentHash.length).toBe(16)
      }
    })

    it("produces the same hash for identical content", () => {
      const prose = "word ".repeat(30)
      const md = `# Determinism\n\n${prose}\n`
      const chunksA = chunkMarkdown(md)
      const chunksB = chunkMarkdown(md)
      expect(chunksA.length).toBeGreaterThanOrEqual(1)
      expect(chunksA[0]!.contentHash).toBe(chunksB[0]!.contentHash)
    })

    it("produces different hashes for different content", () => {
      const proseA = "alpha ".repeat(30)
      const proseB = "beta ".repeat(30)
      const mdA = `# A\n\n${proseA}\n`
      const mdB = `# B\n\n${proseB}\n`
      const chunksA = chunkMarkdown(mdA)
      const chunksB = chunkMarkdown(mdB)
      expect(chunksA.length).toBeGreaterThanOrEqual(1)
      expect(chunksB.length).toBeGreaterThanOrEqual(1)
      expect(chunksA[0]!.contentHash).not.toBe(chunksB[0]!.contentHash)
    })
  })

  describe("small fragment filtering", () => {
    it("filters out chunks with fewer than 100 characters of content", () => {
      const md = `# Title\n\nShort.\n\n# Long Section\n\nThis section has enough content to survive the minimum character filter applied to prose chunks.\n`
      const chunks = chunkMarkdown(md)
      for (const chunk of chunks) {
        expect(chunk.content.trim().length).toBeGreaterThanOrEqual(100)
      }
    })

    it("drops an empty document entirely", () => {
      const chunks = chunkMarkdown("")
      expect(chunks).toHaveLength(0)
    })
  })

  describe("prose splitting at 512-token boundary", () => {
    it("splits very long prose into multiple chunks when paragraphs together exceed 2048 chars", () => {
      // MAX_PROSE_TOKENS=512 * CHARS_PER_TOKEN=4 = 2048 chars per chunk
      // Build multiple paragraphs that each fit alone but together exceed the limit
      const para = "word ".repeat(150)   // ~750 chars per paragraph
      const md = [
        "# Long",
        "",
        para,
        "",
        para,
        "",
        para,
        "",
        para,
        "",
      ].join("\n")
      const chunks = chunkMarkdown(md)
      const proseChunks = chunks.filter((c) => c.contentType === "prose")
      expect(proseChunks.length).toBeGreaterThanOrEqual(2)
    })

    it("includes overlap between adjacent large prose chunks", () => {
      // Two paragraphs whose total length exceeds the 2048-char max
      const para1 = "alpha ".repeat(250)   // ~1500 chars
      const para2 = "beta ".repeat(250)    // ~1500 chars
      const md = `# Overlap\n\n${para1}\n\n${para2}\n`
      const chunks = chunkMarkdown(md)
      const proseChunks = chunks.filter((c) => c.contentType === "prose")
      // The second chunk should carry overlap from the tail of the first chunk
      if (proseChunks.length >= 2) {
        const firstEnd = proseChunks[0]!.content.slice(-200)
        expect(proseChunks[1]!.content).toContain(firstEnd.slice(-50))
      }
    })
  })
})

// ── chunkOpenAPI ─────────────────────────────────────────────────────────────

describe("chunkOpenAPI", () => {
  const minimalSpec = {
    openapi: "3.0.0",
    paths: {
      "/users": {
        get: {
          summary: "List all users",
          description: "Returns a paginated list of all registered users in the system.",
          operationId: "listUsers",
        },
        post: {
          summary: "Create a user",
          description: "Creates a new user account with the provided profile data.",
          operationId: "createUser",
        },
      },
      "/users/{id}": {
        get: {
          summary: "Get user by ID",
          description: "Retrieves a single user record by their unique identifier.",
          operationId: "getUserById",
        },
      },
    },
  }

  it("produces one chunk per path+method combination", () => {
    const chunks = chunkOpenAPI(minimalSpec)
    expect(chunks).toHaveLength(3)
  })

  it("includes the HTTP method and path in chunk content", () => {
    const chunks = chunkOpenAPI(minimalSpec)
    const getUserChunk = chunks.find((c) => c.content.includes("GET /users/{id}"))
    expect(getUserChunk).toBeDefined()
  })

  it("includes summary in chunk content", () => {
    const chunks = chunkOpenAPI(minimalSpec)
    const listChunk = chunks.find((c) => c.content.includes("List all users"))
    expect(listChunk).toBeDefined()
  })

  it("includes description in chunk content", () => {
    const chunks = chunkOpenAPI(minimalSpec)
    const createChunk = chunks.find((c) => c.content.includes("Creates a new user account"))
    expect(createChunk).toBeDefined()
  })

  it("sets contentType to structured", () => {
    const chunks = chunkOpenAPI(minimalSpec)
    for (const chunk of chunks) {
      expect(chunk.contentType).toBe("structured")
    }
  })

  it("sets sectionPath to sectionPath > METHOD /path", () => {
    const chunks = chunkOpenAPI(minimalSpec, "API Reference")
    const chunk = chunks.find((c) => c.content.includes("GET /users\n"))
    expect(chunk!.sectionPath).toBe("API Reference > GET /users")
  })

  it("uses default sectionPath when none is provided", () => {
    const chunks = chunkOpenAPI(minimalSpec)
    expect(chunks[0]!.sectionPath).toMatch(/^API Reference >/)
  })

  it("returns empty array when spec has no paths key", () => {
    const chunks = chunkOpenAPI({ openapi: "3.0.0", info: { title: "Empty" } })
    expect(chunks).toHaveLength(0)
  })

  it("skips operations whose combined content is shorter than 100 chars", () => {
    const spec = {
      paths: {
        "/x": {
          get: {
            // No summary, description, or operationId — "GET /x" alone is 6 chars
          },
        },
      },
    }
    const chunks = chunkOpenAPI(spec)
    expect(chunks).toHaveLength(0)
  })

  it("computes a non-empty contentHash for each chunk", () => {
    const chunks = chunkOpenAPI(minimalSpec)
    for (const chunk of chunks) {
      expect(chunk.contentHash).toBeTruthy()
      expect(chunk.contentHash.length).toBe(16)
    }
  })
})

// ── chunkGitHubItem ──────────────────────────────────────────────────────────

describe("chunkGitHubItem", () => {
  const baseOpts = {
    title: "Fix: login button unresponsive on iOS 17",
    body: "Users on iOS 17 report that the login button does not respond to taps when using Safari. Reproducible on iPhone 14 and 15. Steps: 1) Open app 2) Tap login 3) Nothing happens.",
    labels: ["bug", "ios", "priority-high"],
    url: "https://github.com/org/repo/issues/42",
  }

  it("returns a single RawChunk", () => {
    const chunk = chunkGitHubItem(baseOpts)
    expect(chunk).toBeDefined()
    expect(typeof chunk).toBe("object")
  })

  it("sets contentType to prose", () => {
    const chunk = chunkGitHubItem(baseOpts)
    expect(chunk.contentType).toBe("prose")
  })

  it("includes the title in chunk content", () => {
    const chunk = chunkGitHubItem(baseOpts)
    expect(chunk.content).toContain("Fix: login button unresponsive on iOS 17")
  })

  it("includes all labels joined by comma in chunk content", () => {
    const chunk = chunkGitHubItem(baseOpts)
    expect(chunk.content).toContain("bug, ios, priority-high")
  })

  it("includes the body in chunk content", () => {
    const chunk = chunkGitHubItem(baseOpts)
    expect(chunk.content).toContain("Users on iOS 17 report")
  })

  it("sets sectionPath to the issue URL", () => {
    const chunk = chunkGitHubItem(baseOpts)
    expect(chunk.sectionPath).toBe("https://github.com/org/repo/issues/42")
  })

  it("computes a non-empty contentHash", () => {
    const chunk = chunkGitHubItem(baseOpts)
    expect(chunk.contentHash).toBeTruthy()
    expect(chunk.contentHash.length).toBe(16)
  })

  it("includes resolutionNote when provided", () => {
    const chunk = chunkGitHubItem({
      ...baseOpts,
      resolutionNote: "Fixed in v2.3.1 by updating the tap event handler.",
    })
    expect(chunk.content).toContain("Fixed in v2.3.1")
  })

  it("omits labels line when labels array is empty", () => {
    const chunk = chunkGitHubItem({ ...baseOpts, labels: [] })
    expect(chunk.content).not.toContain("Labels:")
  })

  it("omits labels line when labels is undefined", () => {
    const { labels: _labels, ...optsNoLabels } = baseOpts
    const chunk = chunkGitHubItem(optsNoLabels)
    expect(chunk.content).not.toContain("Labels:")
  })

  it("truncates body to 500 characters", () => {
    const longBody = "x".repeat(1000)
    const chunk = chunkGitHubItem({ ...baseOpts, body: longBody })
    // Body line starts with "Body: " then up to 500 chars of content
    const bodyLine = chunk.content.split("\n").find((l) => l.startsWith("Body:"))
    expect(bodyLine!.length).toBeLessThanOrEqual("Body: ".length + 500)
  })
})
