import { getDb } from '../src/infra/db/client.js'
const db = getDb()

const cases = await db`SELECT case_id, title, status FROM cases WHERE title ILIKE '%billing%' OR title ILIKE '%charged%' LIMIT 5`
console.log('Cases:', JSON.stringify(cases, null, 2))

if (cases.length > 0) {
  const caseIds = cases.map((c: any) => c.case_id)
  const crs = await db`SELECT cr_id, case_id, status, title, created_at FROM change_requests WHERE case_id = ANY(${caseIds}) ORDER BY created_at`
  console.log('CRs:', JSON.stringify(crs, null, 2))
  
  // Also check pg-boss jobs for change_prep
  const jobs = await db`SELECT id, name, state, data, created_on, started_on, completed_on FROM pgboss.job WHERE name = 'change_prep' ORDER BY created_on DESC LIMIT 10`
  console.log('Jobs:', JSON.stringify(jobs, null, 2))
}

process.exit(0)
