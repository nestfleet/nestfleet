/**
 * One-shot seed: creates an admin operator user.
 * Usage: tsx --env-file .env scripts/seed-admin.ts
 */
import bcrypt from "bcryptjs"
import { getDb } from "../src/infra/db/client.js"
import { newId } from "../src/infra/db/id.js"

const EMAIL    = process.env.SEED_EMAIL    ?? "admin@nestfleet.local"
const PASSWORD = process.env.SEED_PASSWORD ?? "nestfleet-admin-2025"
const ROUNDS   = 12

const db   = getDb()
const hash = await bcrypt.hash(PASSWORD, ROUNDS)
const id   = newId("usr_")

await db`
  INSERT INTO operator_users (user_id, email, password_hash, roles)
  VALUES (${id}, ${EMAIL}, ${hash}, ARRAY['admin'])
  ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    roles         = EXCLUDED.roles
`

console.log(`✓ Admin user upserted`)
console.log(`  email:    ${EMAIL}`)
console.log(`  password: ${PASSWORD}`)
console.log(`  user_id:  ${id}`)

await db.end()
