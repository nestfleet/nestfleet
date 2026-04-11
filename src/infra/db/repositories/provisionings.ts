/**
 * Provisionings & signup_intents repositories — FEAT-001.
 *
 * All writes use parameterised queries (no string interpolation).
 * The `provisionings` table is the saga state store: each column
 * acts as a step-completion marker so the worker can resume safely
 * after a crash or retry without re-executing completed steps.
 */

import { getDb } from "../client.js"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SignupIntentRow {
  id:                     string
  email:                  string
  org_slug:               string
  plan:                   string
  status:                 string
  stripe_customer_id:     string | null
  stripe_subscription_id: string | null
  created_at:             Date
}

export interface ProvisioningRow {
  id:                     string
  intent_id:              string
  org_slug:               string
  customer_email:         string
  plan:                   string
  stripe_customer_id:     string | null
  stripe_subscription_id: string | null
  hetzner_server_id:      number | null   // null = VPS not yet created
  hetzner_server_ip:      string | null
  cloudflare_record_id:   string | null   // null = DNS not yet created
  secrets_enc:            string | null   // AES-encrypted JSON of per-VPS secrets
  status:                 string
  provisioned_at:         Date | null
  deprovision_after:      Date | null
  deprovisioned_at:       Date | null
  last_health_check_at:   Date | null
  last_health_status:     string | null
  error_message:          string | null
  // FEAT-012: license lifecycle tracking
  license_tier:           string | null
  license_expires_at:     Date | null
  reissue_status:         "idle" | "in_progress" | "failed"
  // FEAT-017-G: short reactivation window after cancellation
  reactivation_deadline:  Date | null
  created_at:             Date
  updated_at:             Date
}

export type ProvisioningPatch = Partial<Pick<
  ProvisioningRow,
  | "status"
  | "customer_email"
  | "plan"
  | "hetzner_server_id"
  | "hetzner_server_ip"
  | "cloudflare_record_id"
  | "secrets_enc"
  | "stripe_customer_id"
  | "stripe_subscription_id"
  | "provisioned_at"
  | "deprovision_after"
  | "deprovisioned_at"
  | "last_health_check_at"
  | "last_health_status"
  | "error_message"
  | "license_tier"
  | "license_expires_at"
  | "reissue_status"
  | "reactivation_deadline"
>>

// ── signup_intents ─────────────────────────────────────────────────────────────

export async function createSignupIntent(data: {
  email:    string
  orgSlug:  string
  plan:     string
}): Promise<SignupIntentRow> {
  const db = getDb()
  const [row] = await db<SignupIntentRow[]>`
    INSERT INTO signup_intents (email, org_slug, plan)
    VALUES (${data.email}, ${data.orgSlug}, ${data.plan})
    RETURNING *
  `
  if (!row) throw new Error("createSignupIntent: INSERT returned no row")
  return row
}

export async function findSignupIntentById(id: string): Promise<SignupIntentRow | null> {
  const db = getDb()
  const [row] = await db<SignupIntentRow[]>`
    SELECT * FROM signup_intents WHERE id = ${id}
  `
  return row ?? null
}

export async function updateSignupIntentStatus(
  id: string,
  status: "completed" | "abandoned",
): Promise<void> {
  const db = getDb()
  await db`
    UPDATE signup_intents SET status = ${status} WHERE id = ${id}
  `
}

/** Store Stripe IDs on the signup_intent at checkout.session.completed (FEAT-017-A). */
export async function updateSignupIntentStripeIds(
  id:                     string,
  stripeCustomerId:       string | null,
  stripeSubscriptionId:   string | null,
): Promise<void> {
  const db = getDb()
  await db`
    UPDATE signup_intents
    SET stripe_customer_id     = ${stripeCustomerId},
        stripe_subscription_id = ${stripeSubscriptionId}
    WHERE id = ${id}
  `
}

/** Check if a slug is reserved by any signup_intent (all statuses). */
export async function slugHasSignupIntent(slug: string): Promise<boolean> {
  const db = getDb()
  const [row] = await db<{ exists: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM signup_intents WHERE org_slug = ${slug}) AS exists
  `
  return row?.exists ?? false
}

// ── provisionings ─────────────────────────────────────────────────────────────

export async function createProvisioning(data: {
  intentId:             string
  orgSlug:              string
  customerEmail:        string
  plan:                 string
  stripeCustomerId?:    string | null
  stripeSubscriptionId?: string | null
}): Promise<ProvisioningRow> {
  const db = getDb()
  const [row] = await db<ProvisioningRow[]>`
    INSERT INTO provisionings (
      intent_id, org_slug, customer_email, plan,
      stripe_customer_id, stripe_subscription_id
    )
    VALUES (
      ${data.intentId}, ${data.orgSlug}, ${data.customerEmail}, ${data.plan},
      ${data.stripeCustomerId ?? null}, ${data.stripeSubscriptionId ?? null}
    )
    RETURNING *
  `
  if (!row) throw new Error("createProvisioning: INSERT returned no row")
  return row
}

export async function findProvisioningByIntentId(intentId: string): Promise<ProvisioningRow | null> {
  const db = getDb()
  const [row] = await db<ProvisioningRow[]>`
    SELECT * FROM provisionings WHERE intent_id = ${intentId}
  `
  return row ?? null
}

export async function findProvisioningBySlug(slug: string): Promise<ProvisioningRow | null> {
  const db = getDb()
  const [row] = await db<ProvisioningRow[]>`
    SELECT * FROM provisionings WHERE org_slug = ${slug}
  `
  return row ?? null
}

/** Find a provisioning by its Stripe customer ID (FEAT-017-D). */
export async function findProvisioningByStripeCustomerId(stripeCustomerId: string): Promise<ProvisioningRow | null> {
  const db = getDb()
  const [row] = await db<ProvisioningRow[]>`
    SELECT * FROM provisionings
    WHERE stripe_customer_id = ${stripeCustomerId}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return row ?? null
}

/**
 * Find the most recent active or deprovisioning provisioning for a customer email.
 * Used by the magic link endpoint (FEAT-017-B) to look up a customer's instance.
 */
export async function findProvisioningByEmail(email: string): Promise<ProvisioningRow | null> {
  const db = getDb()
  const [row] = await db<ProvisioningRow[]>`
    SELECT * FROM provisionings
    WHERE customer_email = ${email}
      AND status IN ('active', 'deprovisioning')
    ORDER BY created_at DESC
    LIMIT 1
  `
  return row ?? null
}

export async function updateProvisioning(
  id: string,
  patch: ProvisioningPatch,
): Promise<ProvisioningRow> {
  const db = getDb()
  // Build update dynamically from non-undefined patch fields
  const fields: Record<string, unknown> = { updated_at: new Date() }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) fields[k] = v
  }

  const [row] = await db<ProvisioningRow[]>`
    UPDATE provisionings
    SET ${db(fields)}
    WHERE id = ${id}
    RETURNING *
  `
  if (!row) throw new Error(`updateProvisioning: no row found for id ${id}`)
  return row
}

/** Paginated list for the owner fleet console. */
export async function listProvisionings(opts: {
  limit:  number
  offset: number
  status?: string
}): Promise<{ rows: ProvisioningRow[]; total: number }> {
  const db = getDb()
  if (opts.status) {
    const rows = await db<ProvisioningRow[]>`
      SELECT * FROM provisionings
      WHERE status = ${opts.status}
      ORDER BY created_at DESC
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    `
    const countResult = await db<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM provisionings WHERE status = ${opts.status}
    `
    return { rows, total: parseInt(countResult[0]?.count ?? "0", 10) }
  }
  const rows = await db<ProvisioningRow[]>`
    SELECT * FROM provisionings
    ORDER BY created_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `
  const countResult = await db<{ count: string }[]>`
    SELECT COUNT(*)::text AS count FROM provisionings
  `
  return { rows, total: parseInt(countResult[0]?.count ?? "0", 10) }
}

/** Returns all rows past their deprovision_after date — called by nightly scheduler. */
export async function findExpiredDeprovisionings(): Promise<ProvisioningRow[]> {
  const db = getDb()
  return db<ProvisioningRow[]>`
    SELECT * FROM provisionings
    WHERE status = 'deprovisioning'
      AND deprovision_after IS NOT NULL
      AND deprovision_after < now()
    ORDER BY deprovision_after ASC
  `
}
