import { neon, Pool as NeonPool } from "@neondatabase/serverless"
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http"
import { drizzle as drizzleNeonWs } from "drizzle-orm/neon-serverless"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema/index.ts"

const globalForDb = globalThis as unknown as { __pool?: Pool }

const isNeon = (url: string | undefined) => /\.neon\.tech(:|\/|$)/.test(url ? new URL(url).host : "")

function createPool() {
  // Lazy connection: constructing a Pool never connects, so importing this
  // module (build, tests, SQL generation) works without a database.
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
}

const pool = (globalForDb.__pool ??= createPool())
// Idle-client errors (e.g. database down) must not crash the process.
pool.on("error", (e: Error) => console.error("pg pool error:", e.message))

const pgDb = drizzle(pool, { schema })
export type Db = typeof pgDb

// On Cloudflare Workers a socket opened in one request cannot be used by another, so a shared node-postgres
// pool fails there. Neon is queried over HTTP instead (one fetch per query, nothing to share). HTTP has no
// transactions, so `transaction` opens a short-lived WebSocket connection and closes it afterwards.
function createNeonDb(): Db {
  const http = drizzleNeonHttp(neon(process.env.DATABASE_URL ?? ""), { schema })
  const transaction = async (...args: Parameters<Db["transaction"]>) => {
    const ws = new NeonPool({ connectionString: process.env.DATABASE_URL })
    try {
      return await drizzleNeonWs(ws, { schema }).transaction(...(args as [never]))
    } finally {
      await ws.end()
    }
  }
  return new Proxy(http, {
    get: (target, prop, receiver) => (prop === "transaction" ? transaction : Reflect.get(target, prop, receiver)),
  }) as unknown as Db
}

/**
 * RAW, UNSCOPED database handle. Tenant and admin code must NOT import this:
 * ESLint blocks it outside lib/db, lib/auth, lib/tenant, scripts and tests.
 * Use `scopedDb(dealerId)` from "@/lib/db/scoped" instead.
 */
export const unscopedDb: Db = isNeon(process.env.DATABASE_URL) ? createNeonDb() : pgDb
export { pool }
