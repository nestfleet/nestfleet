/**
 * Seed: creates the Acme pilot product and fires several test webhooks
 * to populate the case queue visible in the operator console.
 *
 * Usage: npx tsx --env-file .env scripts/seed-product.ts
 */
import { getDb } from "../src/infra/db/client.js"
import { newId } from "../src/infra/db/id.js"

async function main() {
  const db = getDb()

  // ── 1. Upsert product ────────────────────────────────────────────────────
  const productId = newId("prod_")

  await db`
    INSERT INTO products (product_id, slug, name, stage, support_policy, enabled_channels, lead_assignments)
    VALUES (
      ${productId},
      'acme',
      'Acme',
      'beta',
      ${{ github_repo: "acme/app" }}::jsonb,
      ARRAY['email'],
      ${{ support_lead: "admin@nestfleet.local", change_lead: "admin@nestfleet.local" }}::jsonb
    )
    ON CONFLICT DO NOTHING
  `

  console.log(`✓ Product created: ${productId}`)
  console.log(`  NEXT_PUBLIC_PRODUCT_ID=${productId}`)

  await db.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
