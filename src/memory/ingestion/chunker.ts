// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * Structure-aware chunker.
 * ADR-019: content type determines chunking strategy and retrieval method.
 * Spec: product-memory-specification.md section 6.
 */

import crypto from "node:crypto"
import type { ContentType } from "../types.js"

export interface RawChunk {
  content: string
  contentType: ContentType
  sectionPath: string
  contentHash: string
  language?: string   // detected for code blocks
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_PROSE_TOKENS = 512     // approx. 512 tokens ≈ 2048 chars (rough)
const MIN_PROSE_CHARS = 100      // discard fragments smaller than this
const PROSE_OVERLAP_CHARS = 200  // ~50 token overlap between adjacent prose chunks
const CHARS_PER_TOKEN = 4        // rough approximation

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Chunk a markdown document into typed raw chunks.
 * Returns an ordered array of RawChunk items ready for tier assignment and embedding.
 */
export function chunkMarkdown(markdown: string): RawChunk[] {
  const chunks: RawChunk[] = []

  // Step 1: Split into blocks — either fenced code blocks or prose sections
  const blocks = splitIntoBlocks(markdown)

  for (const block of blocks) {
    if (block.type === "code") {
      chunks.push(...chunkCodeBlock(block.content, block.sectionPath, block.lang))
    } else {
      chunks.push(...chunkProseSection(block.content, block.sectionPath))
    }
  }

  return chunks.filter((c) => c.content.trim().length >= MIN_PROSE_CHARS)
}

/**
 * Convert a structured document (OpenAPI YAML/JSON) to natural-language summary chunks.
 * Each path/operation becomes one chunk.
 */
export function chunkOpenAPI(spec: Record<string, unknown>, sectionPath = "API Reference"): RawChunk[] {
  const chunks: RawChunk[] = []
  const paths = spec["paths"] as Record<string, Record<string, unknown>> | undefined
  if (!paths) return chunks

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const op = operation as Record<string, unknown>
      const summary = op["summary"] as string | undefined
      const description = op["description"] as string | undefined
      const operationId = op["operationId"] as string | undefined

      const nlContent = [
        `${method.toUpperCase()} ${path}`,
        summary ? `Summary: ${summary}` : null,
        description ? `Description: ${description}` : null,
        operationId ? `Operation ID: ${operationId}` : null,
      ]
        .filter(Boolean)
        .join("\n")

      if (nlContent.length >= MIN_PROSE_CHARS) {
        chunks.push({
          content: nlContent,
          contentType: "structured",
          sectionPath: `${sectionPath} > ${method.toUpperCase()} ${path}`,
          contentHash: hashContent(nlContent),
        })
      }
    }
  }

  return chunks
}

/**
 * Chunk a GitHub issue or PR body into a single summary chunk.
 */
export function chunkGitHubItem(opts: {
  title: string
  body: string
  labels?: string[]
  resolutionNote?: string
  url: string
}): RawChunk {
  const content = [
    `Title: ${opts.title}`,
    opts.labels?.length ? `Labels: ${opts.labels.join(", ")}` : null,
    opts.body ? `Body: ${opts.body.slice(0, 500)}` : null,
    opts.resolutionNote ? `Resolution: ${opts.resolutionNote.slice(0, 300)}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  return {
    content,
    contentType: "prose",
    sectionPath: opts.url,
    contentHash: hashContent(content),
  }
}

// ── Internal ─────────────────────────────────────────────────────────────────

interface Block {
  type: "prose" | "code"
  content: string
  sectionPath: string
  lang?: string
}

function splitIntoBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.split("\n")
  let currentHeadings: string[] = []
  let proseBuf: string[] = []
  let inCode = false
  let codeBuf: string[] = []
  let codeLang = ""
  let codeStartPath = ""

  const flushProse = () => {
    if (proseBuf.length > 0) {
      blocks.push({
        type: "prose",
        content: proseBuf.join("\n"),
        sectionPath: currentHeadings.join(" > ") || "Root",
      })
      proseBuf = []
    }
  }

  for (const line of lines) {
    // Code fence detection
    const codeFenceMatch = line.match(/^```(\w*)/)
    if (codeFenceMatch && !inCode) {
      flushProse()
      inCode = true
      codeLang = codeFenceMatch[1] ?? ""
      codeStartPath = currentHeadings.join(" > ") || "Root"
      continue
    }
    if (line.startsWith("```") && inCode) {
      const codeBlock: Block = {
        type: "code",
        content: codeBuf.join("\n"),
        sectionPath: codeStartPath,
      }
      if (codeLang) codeBlock.lang = codeLang
      blocks.push(codeBlock)
      codeBuf = []
      inCode = false
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    // Heading detection — update section path hierarchy
    const h1 = line.match(/^# (.+)/)
    const h2 = line.match(/^## (.+)/)
    const h3 = line.match(/^### (.+)/)
    const h4 = line.match(/^#### (.+)/)

    if (h1) {
      flushProse()
      currentHeadings = [h1[1] as string]
    } else if (h2) {
      flushProse()
      currentHeadings = [currentHeadings[0] ?? "", h2[1] as string].filter(Boolean)
    } else if (h3) {
      flushProse()
      currentHeadings = [
        currentHeadings[0] ?? "",
        currentHeadings[1] ?? "",
        h3[1] as string,
      ].filter(Boolean)
    } else if (h4) {
      flushProse()
      currentHeadings = [
        currentHeadings[0] ?? "",
        currentHeadings[1] ?? "",
        currentHeadings[2] ?? "",
        h4[1] as string,
      ].filter(Boolean)
    } else {
      proseBuf.push(line)
    }
  }

  flushProse()
  return blocks
}

function chunkProseSection(prose: string, sectionPath: string): RawChunk[] {
  const maxChars = MAX_PROSE_TOKENS * CHARS_PER_TOKEN
  const chunks: RawChunk[] = []

  if (prose.length <= maxChars) {
    // Single chunk — add sectionPath as context prefix
    const content = sectionPath ? `[${sectionPath}]\n${prose}` : prose
    return [{ content, contentType: "prose", sectionPath, contentHash: hashContent(content) }]
  }

  // Split by paragraph boundaries first, then by char limit
  const paragraphs = prose.split(/\n\n+/)
  let buf = `[${sectionPath}]\n`
  let lastChunkEnd = ""

  const flush = () => {
    if (buf.trim().length > MIN_PROSE_CHARS) {
      chunks.push({ content: buf.trim(), contentType: "prose", sectionPath, contentHash: hashContent(buf.trim()) })
    }
    // Carry overlap from end of last chunk
    lastChunkEnd = buf.slice(-PROSE_OVERLAP_CHARS)
    buf = `[${sectionPath}]\n${lastChunkEnd}\n`
  }

  for (const para of paragraphs) {
    if ((buf + para).length > maxChars) {
      flush()
    }
    buf += para + "\n\n"
  }

  if (buf.trim().length > MIN_PROSE_CHARS) {
    chunks.push({ content: buf.trim(), contentType: "prose", sectionPath, contentHash: hashContent(buf.trim()) })
  }

  return chunks
}

function chunkCodeBlock(code: string, sectionPath: string, lang?: string): RawChunk[] {
  if (!code.trim()) return []

  // Code blocks are never split — one block = one chunk
  const content = lang
    ? `\`\`\`${lang}\n${code}\n\`\`\``
    : `\`\`\`\n${code}\n\`\`\``

  const chunk: RawChunk = {
    content,
    contentType: "code",
    sectionPath,
    contentHash: hashContent(content),
  }
  if (lang) chunk.language = lang
  return [chunk]
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16)
}
