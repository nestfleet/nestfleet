/**
 * Shared provisioning helper for NF-PROV-01 integration tests.
 *
 * `provisionOrg()` runs the full first-time-user flow:
 *   POST /auth/register → POST /setup/complete → signJwt with productId
 *
 * Returns everything a test needs to make authenticated requests against
 * the newly provisioned workspace.
 */

import { app } from "../../../src/api/index.js"
import { signJwt } from "../../../src/auth/jwt.js"

export interface ProvisionedOrg {
  /** Operator user ID created by register */
  userId: string
  email: string
  /** JWT from register (productIds: [] — no product yet) */
  registerToken: string
  /** product_id of the created product */
  productId: string
  productSlug: string
  productName: string
  /** JWT signed with productIds: [productId] — use for authenticated requests */
  adminToken: string
}

export interface ProvisionOpts {
  email: string
  password?: string
  productName?: string
}

/**
 * Run the full register → setup/complete chain and return all credentials.
 * Throws if any step fails.
 */
export async function provisionOrg(opts: ProvisionOpts): Promise<ProvisionedOrg> {
  const password    = opts.password    ?? "SecurePass123"
  const productName = opts.productName ?? "Test Product"

  // ── 1. Register ─────────────────────────────────────────────────────────────
  const regRes = await app.request("/api/v1/auth/register", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email: opts.email, password }),
  })
  if (regRes.status !== 201) {
    const body = await regRes.text()
    throw new Error(`provisionOrg: register failed (${regRes.status}): ${body}`)
  }
  const regBody = await regRes.json() as Record<string, unknown>
  const regData  = regBody.data as Record<string, unknown>
  const userId   = (regData.user as Record<string, unknown>).userId as string
  const registerToken = regData.token as string

  // ── 2. Setup / create first product ─────────────────────────────────────────
  // Authorization header is required so the backend links the new product to
  // the registered user (setup.ts:149-164). Without it product_ids stays [].
  const setupRes = await app.request("/api/v1/setup/complete", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${registerToken}`,
    },
    body:    JSON.stringify({ productName }),
  })
  if (setupRes.status !== 200) {
    const body = await setupRes.text()
    throw new Error(`provisionOrg: setup/complete failed (${setupRes.status}): ${body}`)
  }
  const setupBody = await setupRes.json() as Record<string, unknown>
  const setupData  = setupBody.data as Record<string, unknown>
  const productId   = setupData.productId   as string
  const productSlug = setupData.productSlug as string

  // ── 3. Build an admin token with the new product in scope ───────────────────
  const adminToken = signJwt({
    sub:        userId,
    email:      opts.email,
    roles:      ["admin"],
    productIds: [productId],
  })

  return {
    userId,
    email:         opts.email,
    registerToken,
    productId,
    productSlug,
    productName,
    adminToken,
  }
}
