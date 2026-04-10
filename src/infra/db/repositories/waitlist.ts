// SPDX-License-Identifier: AGPL-3.0-or-later
import { getDb } from "../client.js"

export interface WaitlistEntry {
  email:    string
  name?:    string | undefined
  company?: string | undefined
  plan?:    string | undefined
  ip?:      string | undefined
}

export async function insertWaitlistEntry(entry: WaitlistEntry): Promise<void> {
  const db = getDb()
  await db`
    INSERT INTO waitlist (email, name, company, plan, ip)
    VALUES (
      ${entry.email},
      ${entry.name    ?? null},
      ${entry.company ?? null},
      ${entry.plan    ?? null},
      ${entry.ip      ?? null}
    )
  `
}
