/**
 * Re-dispatch triage jobs for cases stuck in 'enriching'.
 * Usage: npx tsx --env-file .env scripts/retriage-cases.ts
 */
import { getDb } from "../src/infra/db/client.js"
import { newId } from "../src/infra/db/id.js"
import { dispatch } from "../src/agents/dispatcher.js"

async function main() {
  const db = getDb()

  const cases = await db<{ case_id: string; product_id: string; title: string }[]>`
    SELECT case_id, product_id, title
    FROM cases
    WHERE status = 'enriching'
    AND product_id = 'prod_01kkyb2x4444sj4px80v3253ha'
    ORDER BY created_at ASC
  `

  console.log(`Found ${cases.length} enriching cases to re-triage`)

  for (const c of cases) {
    const jobId = newId("job_")
    await dispatch({
      actionType: "triage",
      productId:  c.product_id,
      caseId:     c.case_id,
      jobId,
      payload:    { signalText: c.title },
    })
    console.log(`  ✓ dispatched triage for ${c.case_id} — "${c.title?.slice(0,50)}"`)
  }

  await db.end()
}

main().catch(err => { console.error(err); process.exit(1) })
