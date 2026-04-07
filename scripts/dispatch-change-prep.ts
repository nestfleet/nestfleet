/**
 * One-off: dispatch change_prep for a specific case.
 * Usage: npx tsx --env-file .env scripts/dispatch-change-prep.ts
 */
import { getDb } from "../src/infra/db/client.js"
import { newId } from "../src/infra/db/id.js"
import { dispatch } from "../src/agents/dispatcher.js"

const CASE_ID    = process.argv[2] ?? "case_01kkyxtj0j6ecgw336zxmgjmtn"
const PRODUCT_ID = "prod_01kkyb2x4444sj4px80v3253ha"

async function main() {
  const db = getDb()
  const rows = await db<{ normalized_payload: Record<string, unknown> }[]>`
    SELECT normalized_payload FROM signals WHERE case_id = ${CASE_ID} LIMIT 1
  `
  const signalText = (rows[0]?.normalized_payload?.signalText as string) ?? ""

  const jobId = newId("job_")
  await dispatch({ actionType: "change_prep", productId: PRODUCT_ID, caseId: CASE_ID, jobId, payload: { signalText } })
  console.log(`✓ change_prep dispatched for ${CASE_ID} — job: ${jobId}`)
  await db.end()
}
main().catch(e => { console.error(e); process.exit(1) })
