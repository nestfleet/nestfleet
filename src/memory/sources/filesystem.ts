/**
 * Filesystem source adapter.
 * Discovers and reads markdown and OpenAPI documents from a local directory.
 * Spec: product-memory-specification.md section 4 (source ingestion).
 *
 * Supported file types:
 *  - .md / .mdx  → chunkMarkdown
 *  - .yaml / .yml / .json → if contains `openapi:` key → chunkOpenAPI
 *
 * Does NOT recurse into node_modules, .git, dist, build directories.
 */

import fs from "node:fs/promises"
import path from "node:path"
import type { SourceType, Audience } from "../types.js"

export interface DiscoveredFile {
  absolutePath: string
  relativePath: string
  mtime: Date
  format: "markdown" | "openapi"
  /** Raw file content */
  content: string
}

/** Directories to skip during traversal. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", "tmp"])

/** Max file size to read (5 MB). Larger files are skipped. */
const MAX_FILE_BYTES = 5 * 1024 * 1024

// ── Public API ──────────────────────────────────────────────────────────────

export interface FilesystemSourceOptions {
  /** Root directory to scan. */
  rootDir: string
  /** Optionally restrict discovery to specific subdirectories (relative to rootDir). */
  includeDirs?: string[]
  /** Glob-like extensions to include (defaults to all supported). */
  extensions?: string[]
}

/**
 * Discover all ingestion-worthy files under a directory.
 * Returns an ordered list (depth-first, alphabetical) of discovered files
 * with their content already loaded.
 */
export async function discoverFiles(opts: FilesystemSourceOptions): Promise<DiscoveredFile[]> {
  const { rootDir, includeDirs } = opts
  const results: DiscoveredFile[] = []

  if (includeDirs && includeDirs.length > 0) {
    for (const subdir of includeDirs) {
      const absSubdir = path.resolve(rootDir, subdir)
      await walkDir(absSubdir, rootDir, results)
    }
  } else {
    await walkDir(rootDir, rootDir, results)
  }

  return results
}

/**
 * Infer the SourceType from a relative file path and its content.
 * Falls back to `readme` for root-level README files, `product_spec` for
 * spec directories, etc. Operators can override via ingestion manifest.
 */
export function inferSourceType(relativePath: string, format: "markdown" | "openapi"): SourceType {
  if (format === "openapi") return "openapi_spec"

  const lower = relativePath.toLowerCase()
  const base = path.basename(lower)

  if (base === "readme.md" || base === "readme.mdx") return "readme"
  if (base === "changelog.md" || base === "changelog.mdx") return "changelog"
  if (lower.includes("faq")) return "faq"
  if (lower.includes("known-issue") || lower.includes("known_issue")) return "known_issues"
  if (lower.includes("troubleshoot") || lower.includes("runbook")) return "troubleshooting_guide"
  if (lower.includes("deploy")) return "deployment_guide"
  if (lower.includes("architect")) return "architecture_overview"
  if (lower.includes("api-doc") || lower.includes("api_doc")) return "api_docs"
  if (lower.includes("spec") || lower.includes("specification")) return "product_spec"
  if (lower.includes("technical") || lower.includes("tech-spec")) return "technical_spec"

  // Default: treat unclassified markdown as a feature spec
  return "feature_spec"
}

/**
 * Infer audience from file path conventions.
 * Anything under /internal/, /ops/, /runbooks/ is internal.
 */
export function inferAudience(relativePath: string): Audience {
  const lower = relativePath.toLowerCase()
  if (
    lower.includes("/internal/") ||
    lower.includes("/ops/") ||
    lower.includes("/runbooks/") ||
    lower.includes("/runbook")
  ) {
    return "internal"
  }
  return "public"
}

// ── Internal ─────────────────────────────────────────────────────────────────

async function walkDir(dir: string, rootDir: string, results: DiscoveredFile[]): Promise<void> {
  let rawEntries: import("node:fs").Dirent[]

  try {
    // withFileTypes: true + encoding: 'utf8' → Dirent<string>
    rawEntries = (await fs.readdir(dir, { withFileTypes: true })) as import("node:fs").Dirent[]
  } catch {
    // Directory unreadable — skip silently
    return
  }

  // Sort for deterministic ordering
  rawEntries.sort((a, b) => String(a.name).localeCompare(String(b.name)))

  for (const entry of rawEntries) {
    const name = String(entry.name)
    const fullPath = path.join(dir, name)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name) || name.startsWith(".")) continue
      await walkDir(fullPath, rootDir, results)
      continue
    }

    if (!entry.isFile()) continue

    const format = detectFormat(name)
    if (!format) continue

    try {
      const stat = await fs.stat(fullPath)
      if (stat.size > MAX_FILE_BYTES) continue

      const rawContent = await fs.readFile(fullPath, "utf-8")

      // For YAML/JSON files, verify they're actually OpenAPI before including
      if ((name.endsWith(".yaml") || name.endsWith(".yml") || name.endsWith(".json")) &&
          format === "openapi") {
        if (!looksLikeOpenAPI(rawContent)) continue
      }

      const relativePath = path.relative(rootDir, fullPath)

      results.push({
        absolutePath: fullPath,
        relativePath,
        mtime: stat.mtime,
        format,
        content: rawContent,
      })
    } catch {
      // File unreadable — skip
    }
  }
}

function detectFormat(filename: string): "markdown" | "openapi" | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown"
  if (lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".json")) return "openapi"
  return null
}

function looksLikeOpenAPI(content: string): boolean {
  // Quick heuristic: OpenAPI docs contain 'openapi:' or '"openapi":'
  return content.includes("openapi:") || content.includes('"openapi":')
}
