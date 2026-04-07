/**
 * Beta Evaluation — Create SkillSeal product
 *
 * Creates the SkillSeal product with the same LLM config as DocuGardener.
 *
 * Usage: npx tsx --env-file .env scripts/beta-eval/create-skillseal.ts
 */
import { getDb, closeDb } from "../../src/infra/db/client.js"
import { newId } from "../../src/infra/db/id.js"

async function main() {
  const db = getDb()

  // Check if SkillSeal already exists
  const [existing] = await db<Array<{ product_id: string }>>`
    SELECT product_id FROM products WHERE name = 'SkillSeal'
  `
  if (existing) {
    console.log(`⚠️  SkillSeal already exists: ${existing.product_id}`)
    await closeDb()
    return
  }

  // Get DocuGardener's LLM config to reuse
  const [dg] = await db<Array<{ llm_config: Record<string, unknown> }>>`
    SELECT llm_config FROM products WHERE name = 'DocuGardener'
  `
  if (!dg?.llm_config) {
    console.error("❌ DocuGardener not found or has no LLM config")
    await closeDb()
    process.exit(1)
  }

  const productId = newId("prod_")

  await db`
    INSERT INTO products (product_id, slug, name, stage, support_policy, enabled_channels, lead_assignments, llm_config)
    VALUES (
      ${productId},
      'skillseal',
      'SkillSeal',
      'beta',
      ${db.json({ github_repo: "alexey-kopachev/skillseal" })}::jsonb,
      ARRAY['email'],
      ${db.json({
        support_lead: "admin@nestfleet.local",
        change_lead: "admin@nestfleet.local",
        product_lead: "admin@nestfleet.local",
      })}::jsonb,
      ${db.json(dg.llm_config)}::jsonb
    )
  `

  console.log(`✅ SkillSeal created: ${productId}`)
  console.log(`   LLM: ${dg.llm_config.provider} / ${dg.llm_config.model}`)
  console.log(`   API Key: ...${(dg.llm_config.apiKeyLast4 as string) || "****"}`)
  console.log(`\n   To point Console at SkillSeal, update console/.env.local:`)
  console.log(`   NEXT_PUBLIC_PRODUCT_ID=${productId}`)

  await closeDb()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
