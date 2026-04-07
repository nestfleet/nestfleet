/**
 * Seed script: creates one test user per role for local/CI testing.
 *
 * Usage:
 *   tsx --env-file .env scripts/seed-test-users.ts
 *
 * All users get the password "nestfleet-test-2025".
 * Existing users are updated via ON CONFLICT (email) DO UPDATE.
 */

import bcrypt from "bcryptjs"
import { getDb } from "../src/infra/db/client.js"
import { newId } from "../src/infra/db/id.js"

const PASSWORD = "nestfleet-test-2025"
const ROUNDS   = 10

interface SeedUser {
  email: string
  roles: string[]
  note?: string
}

const SEED_USERS: SeedUser[] = [
  { email: "admin@nestfleet.local",     roles: ["admin"],                            note: "already exists — refreshes password" },
  { email: "operator@nestfleet.local",  roles: ["operator"] },
  { email: "support@nestfleet.local",   roles: ["support_lead"] },
  { email: "change@nestfleet.local",    roles: ["change_lead"] },
  { email: "product@nestfleet.local",   roles: ["product_lead"] },
  { email: "knowledge@nestfleet.local", roles: ["knowledge_lead"] },
  { email: "multi@nestfleet.local",     roles: ["support_lead", "change_lead"],      note: "multi-role testing" },
]

const db   = getDb()
const hash = await bcrypt.hash(PASSWORD, ROUNDS)

console.log(`Seeding ${SEED_USERS.length} test users...`)
console.log(`Password: ${PASSWORD}\n`)

for (const user of SEED_USERS) {
  const id = newId("usr_")

  await db`
    INSERT INTO operator_users (user_id, email, password_hash, roles)
    VALUES (${id}, ${user.email}, ${hash}, ${user.roles}::text[])
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      roles         = EXCLUDED.roles
  `

  const note = user.note ? `  (${user.note})` : ""
  console.log(`  [OK] ${user.email.padEnd(30)} roles: [${user.roles.join(", ")}]${note}`)
}

console.log("\nDone.")
await db.end()
