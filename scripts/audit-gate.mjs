// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
//
// CI security gate: `npm audit --audit-level=high --omit=dev`, but with a
// time-boxed allowlist of advisory IDs (.github/audit-allowlist.json).
//
// Fails when any high/critical advisory is not allowlisted, or when an
// allowlist entry has expired — an exception can never silently outlive its
// review date. Added for GHSA-mrhx-c7xc-m3w5 (zod 3, no 3.x fix; OPS-M-09).
//
// Usage: node scripts/audit-gate.mjs [allowlist.json]

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

const BLOCKING = new Set(["high", "critical"])

/**
 * @param {{ vulnerabilities?: Record<string, { via: Array<string | { url?: string, severity: string, name: string, title: string }> }> }} audit
 * @param {Record<string, { expires: string }>} allowlist
 * @param {string} today  YYYY-MM-DD
 */
export function evaluate(audit, allowlist, today) {
  // Fail closed: an npm/registry error yields JSON without a vulnerabilities map
  if (!audit || typeof audit.vulnerabilities !== "object" || audit.error) {
    return { failures: [`npm audit did not return a report: ${JSON.stringify(audit?.error ?? audit).slice(0, 300)}`], allowed: [] }
  }
  const blocking = new Map()
  for (const vuln of Object.values(audit.vulnerabilities)) {
    for (const via of vuln.via) {
      // String entries point at another package's entry, which lists its own advisories
      if (typeof via === "string" || !BLOCKING.has(via.severity)) continue
      const id = via.url?.split("/").pop() ?? `${via.name}: ${via.title}`
      blocking.set(id, `${via.severity} ${via.name} — ${via.title}`)
    }
  }

  const failures = []
  const allowed = []
  for (const [id, desc] of blocking) {
    const entry = allowlist[id]
    if (!entry) failures.push(`${id} (${desc})`)
    else if (entry.expires < today) failures.push(`${id} allowlist entry EXPIRED on ${entry.expires} (${desc})`)
    else allowed.push(`${id} until ${entry.expires} (${desc})`)
  }
  return { failures, allowed }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const allowlist = JSON.parse(readFileSync(process.argv[2] ?? ".github/audit-allowlist.json", "utf8"))
  let raw
  try {
    raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  } catch (err) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout
    raw = err.stdout
    if (!raw) throw err
  }
  const { failures, allowed } = evaluate(JSON.parse(raw), allowlist, new Date().toISOString().slice(0, 10))
  for (const a of allowed) console.log(`allowlisted: ${a}`)
  if (failures.length > 0) {
    console.error(`npm audit: ${failures.length} blocking advisory(ies):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log("npm audit: no blocking advisories")
}
