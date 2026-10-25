// Safe commands for the live-database tests. Run through pnpm (docs/staging/neon-test-database.md):
//
//   pnpm test:db setup-sql [database] [role]   print the SQL that makes a database eligible (no secrets)
//   pnpm test:db check                         run every safety check against TEST_DATABASE_URL, change nothing
//   pnpm test:db migrate                       apply the migrations to the disposable database
//   pnpm test:db neon-check                    prove the Neon HTTP and WebSocket driver paths work (temp objects only)
//   pnpm test:db test [vitest args]            run the test suite against it
//
// Everything comes from explicit environment variables. No .env file is read or loaded by this script, and .env.local is never
// consulted. Every command except setup-sql refuses to run unless the database passes tests/support/disposable-db.ts, and
// nothing here prints a password (only user@host:port/database).
import { spawnSync } from "node:child_process"

import { assertDisposableDatabaseAt, checkTestDatabaseConfig, describeTarget, parseTestDatabaseUrl, setupSql, type TestDatabaseIdentity, UnsafeTestDatabaseError } from "../tests/support/disposable-db.ts"

const [command, ...args] = process.argv.slice(2)

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

/** The disposable database, after every check (including the ones that need a connection). */
async function guarded() {
  const checked = checkTestDatabaseConfig()
  if (!checked) {
    fail(
      [
        "TEST_DATABASE_URL is not set. Nothing was touched.",
        "Set it, with TEST_DATABASE_DISPOSABLE=1 and TEST_DATABASE_CONFIRM=<database name>, to a database made by `pnpm test:db setup-sql`.",
      ].join("\n"),
    )
  }
  await assertDisposableDatabaseAt(checked.url, checked.target)
  return checked
}

function run(cmd: string, argv: string[], env: Record<string, string>): never {
  const r = spawnSync(cmd, argv, { stdio: "inherit", env: { ...process.env, ...env }, cwd: process.cwd() })
  process.exit(r.status ?? 1)
}

async function main() {
  switch (command) {
    case "setup-sql": {
      console.log(setupSql(args[0], args[1]))
      return
    }
    case "check": {
      const { target } = await guarded()
      console.log(`OK: ${describeTarget(target)} is a disposable test database.`)
      return
    }
    case "migrate": {
      const { url, target } = await guarded()
      // Neon: migrations should use the DIRECT host (no -pooler). It must pass the very same checks, and be the same database.
      const migrateUrl = process.env.TEST_DATABASE_MIGRATE_URL?.trim() || url
      if (migrateUrl !== url) {
        const m = checkTestDatabaseConfig({ ...process.env, TEST_DATABASE_URL: migrateUrl })
        if (!m || m.target.database !== target.database || m.target.user !== target.user) fail("TEST_DATABASE_MIGRATE_URL must be the same database and role as TEST_DATABASE_URL.")
        await assertDisposableDatabaseAt(migrateUrl, m.target)
      }
      console.log(`Applying migrations to ${describeTarget(parseTestDatabaseUrl(migrateUrl))} ...`)
      // DATABASE_URL is set explicitly, so an .env file in the working directory can never take its place.
      run("node", ["node_modules/drizzle-kit/bin.cjs", "migrate"], { DATABASE_URL: migrateUrl })
      return
    }
    case "test": {
      const { url, target } = await guarded()
      console.log(`Running tests against ${describeTarget(target)} ...`)
      run("node", ["node_modules/vitest/vitest.mjs", "run", ...args], { TEST_DATABASE_URL: url })
      return
    }
    case "neon-check": {
      const { url, target } = await guarded()
      await neonCheck(url, target)
      return
    }
    default:
      fail("usage: pnpm test:db <setup-sql | check | migrate | neon-check | test> (see the comment at the top of scripts/test-db.ts)")
  }
}

/**
 * Which driver path the app will use for this database, and whether each part really works. Uses only temporary tables, so it
 * writes nothing that persists, and does not need the schema to be migrated.
 */
async function neonCheck(url: string, target: TestDatabaseIdentity) {
  process.env.DATABASE_URL = url
  const { sql } = await import("drizzle-orm")
  const { unscopedDb, pool } = await import("../lib/db/client.ts")
  const neon = /\.neon\.tech(:|\/|$)/.test(new URL(url).host)
  console.log(`Driver path: ${neon ? "Neon (HTTP for queries, a WebSocket per transaction)" : "node-postgres (this is NOT the Neon path; a local database cannot prove it)"}`)
  console.log(`Target: ${describeTarget(target)}`)
  const results: [string, boolean, string][] = []
  const check = async (name: string, fn: () => Promise<string>) => {
    try {
      results.push([name, true, await fn()])
    } catch (e) {
      results.push([name, false, e instanceof Error ? e.message.split("\n")[0].slice(0, 160) : "failed"])
    }
  }
  const causeCode = (e: unknown) => (e as { cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code

  const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)]
  const summary = (xs: number[]) => `p50 ${pct(xs, 50).toFixed(0)} ms, p95 ${pct(xs, 95).toFixed(0)} ms, min ${Math.min(...xs).toFixed(0)}, max ${Math.max(...xs).toFixed(0)} (n=${xs.length})`
  await check("plain query (HTTP)", async () => {
    await unscopedDb.execute(sql`select 1`) // warm: wakes a suspended compute, so it is not counted
    const times: number[] = []
    for (let i = 0; i < 15; i++) {
      const t = performance.now()
      await unscopedDb.execute(sql`select 1 as ok`)
      times.push(performance.now() - t)
    }
    return summary(times)
  })
  let openMs = 500
  await check("transaction opens and commits", async () => {
    // Each transaction opens its own WebSocket connection (TLS + authentication), exactly as production does for every booking.
    const times: number[] = []
    for (let i = 0; i < 15; i++) {
      const t = performance.now()
      await unscopedDb.transaction(async (tx) => void (await tx.execute(sql`select 1`)))
      times.push(performance.now() - t)
    }
    openMs = Math.max(500, pct(times, 50))
    return summary(times)
  })
  await check("an error rolls the transaction back", async () => {
    const probe = new Error("rollback-probe")
    let threw = false
    try {
      await unscopedDb.transaction(async (tx) => {
        await tx.execute(sql`create temporary table qa_rollback (x int)`)
        await tx.execute(sql`insert into qa_rollback values (1)`)
        throw probe
      })
    } catch (e) {
      threw = e === probe
    }
    if (!threw) throw new Error("the transaction did not rethrow the error")
    const gone = await unscopedDb.transaction(async (tx) => (await tx.execute(sql`select to_regclass('pg_temp.qa_rollback') as t`)).rows[0] as { t: string | null })
    if (gone.t !== null) throw new Error("work from the failed transaction survived")
    return "the error came back out and nothing survived"
  })
  await check("a unique violation carries SQLSTATE 23505 AND the constraint name, where the app reads them", async () => {
    // The booking-code retry (lib/cabs/trips.ts) retries only a clash of that one constraint, so the NAME must survive the driver.
    const { isUniqueViolation, pgConstraint } = await import("../lib/cabs/pg.ts")
    try {
      await unscopedDb.transaction(async (tx) => {
        await tx.execute(sql`create temporary table qa_unique (x int, constraint qa_unique_x_uq unique (x))`)
        await tx.execute(sql`insert into qa_unique values (1)`)
        await tx.execute(sql`insert into qa_unique values (1)`)
      })
    } catch (e) {
      if (!isUniqueViolation(e)) throw new Error(`code was ${String(causeCode(e))}; isUniqueViolation would MISS this`)
      if (pgConstraint(e) !== "qa_unique_x_uq") throw new Error(`constraint name was ${String(pgConstraint(e))}; the booking-code retry would never fire`)
      return "code 23505 and constraint name both found (isUniqueViolation and pgConstraint work)"
    }
    throw new Error("no error was raised")
  })
  await check("a lock is honoured across two transactions", async () => {
    // A takes an advisory lock and holds it; B is started and must wait. Opening a transaction can take seconds on a distant
    // region (every one opens its own connection), so A holds the lock for well over the measured open time, and both are awaited.
    let order = ""
    let b: Promise<void> = Promise.resolve()
    await unscopedDb.transaction(async (a) => {
      await a.execute(sql`select pg_advisory_xact_lock(424242)`)
      b = unscopedDb.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(424242)`)
        order += "B"
      })
      await new Promise((r) => setTimeout(r, Math.round(openMs * 2.5)))
      order += "A"
    })
    await b
    if (order !== "AB") throw new Error(`lock order was "${order}", expected "AB"`)
    return `second transaction waited for the first (A held the lock ${Math.round(openMs * 2.5)} ms)`
  })

  for (const [name, ok, detail] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`)
  await pool.end().catch(() => {})
  process.exit(results.every((r) => r[1]) ? 0 : 1)
}

main().catch((e) => {
  if (e instanceof UnsafeTestDatabaseError) fail(e.message)
  fail(`failed: ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}`)
})
