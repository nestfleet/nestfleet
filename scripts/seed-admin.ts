// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * One-shot seed: creates an admin operator user.
 * Usage: tsx --env-file .env scripts/seed-admin.ts
 *
 * Required env vars:
 *   SEED_PASSWORD   — password for the admin account (no default — must be set explicitly)
 *   SEED_EMAIL      — email for the admin account (default: admin@nestfleet.local)
 *   DATABASE_URL    — PostgreSQL connection URL
 */
import bcrypt from "bcryptjs"
import { getDb } from "../src/infra/db/client.js"
import { newId } from "../src/infra/db/id.js"

const EMAIL    = process.env.SEED_EMAIL ?? "admin@nestfleet.local"
const PASSWORD = process.env.SEED_PASSWORD

if (!PASSWORD) {
  console.error("Error: SEED_PASSWORD env var is required.")
  console.error("  Set it in your .env file or pass it inline:")
  console.error("  SEED_PASSWORD=<your-password> tsx --env-file .env scripts/seed-admin.ts")
  process.exit(1)
}

const ROUNDS = 12

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
console.log(`  user_id:  ${id}`)

await db.end()
