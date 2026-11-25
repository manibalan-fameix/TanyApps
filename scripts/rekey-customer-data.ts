// Moves customers' encrypted data from the legacy single key (v1) to each business's own key (v2).
//
//   pnpm tsx --env-file=.env.staging scripts/rekey-customer-data.ts            dry run: counts only, writes nothing
//   pnpm tsx --env-file=.env.staging scripts/rekey-customer-data.ts --apply    re-encrypts, one table at a time, in transactions
//
// Safe to run twice: only v1 values are touched, and each value is decrypted with the old key and re-encrypted under the key of the
// business that owns the row (its dealer_id). Back up first. Needs DATABASE_URL and ENCRYPTION_KEY, and never prints a value.
import { Pool } from "pg"

import { decrypt, encrypt, needsRekey } from "../lib/crypto/index.ts"
import { isSealed, phoneLookupHash } from "../lib/db/sealed.ts"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is not set")
if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is not set")
const apply = process.argv.includes("--apply")
const pool = new Pool({ connectionString: url })

/** Plain text columns holding one encrypted value each. */
const COLUMNS: { table: string; column: string }[] = [
  { table: "customers", column: "phone_enc" },
  { table: "customers", column: "email_enc" },
  { table: "customer_addresses", column: "address_enc" },
  { table: "customer_contacts", column: "phone_enc" },
  { table: "trips", column: "notes_enc" },
  { table: "notifications", column: "recipient_enc" },
  { table: "orders", column: "rider_token_enc" },
  { table: "bookings", column: "buyer_phone" },
]
/** A guest's details held as plain text: the columns to seal, and and nothing else. */
const GUESTS = [
  { table: "orders", columns: ["customer_name", "customer_phone", "address", "note"] },
  { table: "enquiries", columns: ["name", "phone", "message"] },
  { table: "table_bookings", columns: ["name", "phone", "note"] },
]
/** `"a" = $1, "b" = $2` for the given column names. */
const assignments = (keys: string[]) => keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ")

/** jsonb columns that carry an `addressEnc` inside them. */
const PLACES: { table: string; column: string }[] = [
  { table: "trips", column: "pickup" },
  { table: "trips", column: "drop" },
]

async function main() {
  const client = await pool.connect()
  try {
    for (const { table, column } of COLUMNS) {
      const { rows } = await client.query<{ id: string; dealer_id: string; v: string }>(`select id, dealer_id, "${column}" as v from "${table}" where "${column}" like 'v1:%'`)
      let done = 0
      if (apply) {
        await client.query("begin")
        for (const r of rows) {
          if (!needsRekey(r.v)) continue
          await client.query(`update "${table}" set "${column}" = $1 where id = $2 and dealer_id = $3 and "${column}" = $4`, [encrypt(decrypt(r.v), r.dealer_id), r.id, r.dealer_id, r.v])
          done++
        }
        await client.query("commit")
      }
      console.log(`${table}.${column}: ${rows.length} legacy value(s)${apply ? `, ${done} re-encrypted` : " (dry run)"}`)
    }
    // Guests' details held as plain text (restaurant orders, enquiries, table requests): seal each under its business's key.
    for (const { table, columns } of GUESTS) {
      const list = columns.map((c) => `"${c}"`).join(", ")
      const { rows } = await client.query<Record<string, string | null> & { id: string; dealer_id: string }>(`select id, dealer_id, ${list} from "${table}"`)
      let found = 0
      let done = 0
      if (apply) await client.query("begin")
      for (const r of rows) {
        const next: Record<string, string> = {}
        for (const c of columns) {
          const v = r[c]
          if (typeof v !== "string" || v === "" || isSealed(v)) continue
          next[c] = encrypt(v.trim(), r.dealer_id)
          if (decrypt(next[c], r.dealer_id) !== v.trim()) throw new Error(`${table} ${r.id}.${c}: round trip failed, nothing written`)
        }
        // An order's number also gets its lookup hash, whether or not the number itself still needed sealing.
        if (table === "orders") {
          const plain = r.customer_phone
          if (typeof plain === "string" && plain && !isSealed(plain)) next.customer_phone_hash = phoneLookupHash(plain.trim())
        }
        const keys = Object.keys(next)
        if (keys.length === 0) continue
        found++
        if (!apply) continue
        await client.query(`update "${table}" set ${assignments(keys)} where id = $${keys.length + 1} and dealer_id = $${keys.length + 2}`, [...keys.map((k) => next[k]), r.id, r.dealer_id])
        done++
      }
      if (apply) await client.query("commit")
      console.log(`${table} (${columns.join(", ")}): ${found} row(s) with plain details${apply ? `, ${done} sealed` : " (dry run)"}`)
    }
    for (const { table, column } of PLACES) {
      const { rows } = await client.query<{ id: string; dealer_id: string; v: { addressEnc?: string } & Record<string, unknown> }>(`select id, dealer_id, "${column}" as v from "${table}" where "${column}"->>'addressEnc' like 'v1:%'`)
      let done = 0
      if (apply) {
        await client.query("begin")
        for (const r of rows) {
          const next = { ...r.v, addressEnc: encrypt(decrypt(r.v.addressEnc!), r.dealer_id) }
          await client.query(`update "${table}" set "${column}" = $1::jsonb where id = $2 and dealer_id = $3`, [JSON.stringify(next), r.id, r.dealer_id])
          done++
        }
        await client.query("commit")
      }
      console.log(`${table}.${column}.addressEnc: ${rows.length} legacy value(s)${apply ? `, ${done} re-encrypted` : " (dry run)"}`)
    }
  } catch (e) {
    await client.query("rollback").catch(() => {})
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
