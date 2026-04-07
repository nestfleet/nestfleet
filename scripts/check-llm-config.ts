import { getDb } from "../src/infra/db/client.js"
import { decryptSecret } from "../src/shared/crypto.js"
const db = getDb()
const rows = await db`SELECT product_id, name, llm_config FROM products WHERE llm_config IS NOT NULL`
for (const r of rows) {
  const cfg = r.llm_config as any
  const raw = cfg?.apiKey as string | undefined
  const decrypted = raw ? decryptSecret(raw) : null
  console.log(JSON.stringify({
    name: r.name,
    provider: cfg?.provider,
    model: cfg?.model,
    rawKeyPrefix: raw?.slice(0, 12),
    decryptedPrefix: decrypted?.slice(0, 8),
    decryptOk: !!decrypted,
  }))
}
await db.end()
