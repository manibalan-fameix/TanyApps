// The only way tests reach a live database. A test database is modified freely (fixtures, jobs that sweep every tenant, trigger
// checks), so it must be one that may be wiped. Four independent checks must ALL pass, and none of them reads .env.local:
//
//   1. explicit opt-in      TEST_DATABASE_DISPOSABLE=1, and TEST_DATABASE_CONFIRM=<the database name>, typed out
//   2. dedicated identity   the database AND the role are named for testing, the role is not an owner role, and (checked on the
//                           server) the database carries the marker COMMENT below, which only someone with ownership can add
//   3. restricted login     the role is not a superuser (checked on the server)
//   4. no known production  only localhost or *.neon.tech; never a host listed in TANY_PRODUCTION_DB_HOSTS, never the same
//                           host and database as DATABASE_URL, never a name that says prod/production/live, never NODE_ENV=production
//
// Set it up with `pnpm test:db setup-sql` (docs/staging/neon-test-database.md). Nothing here prints a password.

export const DISPOSABLE_MARKER = "tany:disposable-test-db"

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(`Refusing to use this database for tests: ${message}`)
    this.name = "UnsafeTestDatabaseError"
  }
}

export type TestDatabaseIdentity = { host: string; port: string; database: string; user: string }
type Env = Record<string, string | undefined>

const TEST_WORD = /(^|[_-])(test|qa|ci|scratch|disposable)([_-]|$)/i
const PROD_WORD = /(^|[_-])(prod|production|live)([_-]|$)/i
/** Roles that own real projects or can do anything. A test role is never one of these. */
const OWNER_ROLES = new Set(["postgres", "neondb_owner", "root", "admin", "owner", "tany", "tanyapps", "rdsadmin"])
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

export function parseTestDatabaseUrl(raw: string): TestDatabaseIdentity {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new UnsafeTestDatabaseError("TEST_DATABASE_URL is not a valid URL.")
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") throw new UnsafeTestDatabaseError("TEST_DATABASE_URL must be a postgres:// URL.")
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""))
  if (!database) throw new UnsafeTestDatabaseError("TEST_DATABASE_URL names no database.")
  return { host: u.hostname.toLowerCase(), port: u.port || "5432", database, user: decodeURIComponent(u.username) }
}

const sameTarget = (a: TestDatabaseIdentity, b: TestDatabaseIdentity) => a.host === b.host && a.port === b.port && a.database === b.database

/** What a person may read about a target: never the password. */
export const describeTarget = (t: TestDatabaseIdentity) => `${t.user}@${t.host}:${t.port}/${t.database}`

/**
 * The checks that need no connection. Throws UnsafeTestDatabaseError on the first failure, with the reason and no secrets.
 * Returns undefined when TEST_DATABASE_URL is not set at all (live-database tests then skip, as they always have).
 */
export function checkTestDatabaseConfig(env: Env = process.env): { url: string; target: TestDatabaseIdentity } | undefined {
  const url = env.TEST_DATABASE_URL?.trim()
  if (!url) return undefined
  const target = parseTestDatabaseUrl(url)

  if (env.NODE_ENV === "production") throw new UnsafeTestDatabaseError("NODE_ENV is production.")
  if (env.TEST_DATABASE_DISPOSABLE !== "1") throw new UnsafeTestDatabaseError("set TEST_DATABASE_DISPOSABLE=1 to confirm this database may be modified and wiped.")
  if (env.TEST_DATABASE_CONFIRM !== target.database) throw new UnsafeTestDatabaseError(`set TEST_DATABASE_CONFIRM=${target.database} (the database name, typed out).`)

  if (!TEST_WORD.test(target.database)) throw new UnsafeTestDatabaseError(`the database name "${target.database}" must contain test, qa, ci, scratch or disposable as a whole word (for example tany_test).`)
  if (PROD_WORD.test(target.database) || PROD_WORD.test(target.user) || PROD_WORD.test(target.host)) throw new UnsafeTestDatabaseError("the host, database or role name says prod, production or live.")
  if (OWNER_ROLES.has(target.user.toLowerCase())) throw new UnsafeTestDatabaseError(`"${target.user}" is an owner role. Use a dedicated test role (for example tany_test_user).`)
  if (!TEST_WORD.test(target.user)) throw new UnsafeTestDatabaseError(`the role name "${target.user}" must contain test, qa, ci or scratch as a whole word (for example tany_test_user).`)

  const allowedHost = LOCAL_HOSTS.has(target.host) || target.host.endsWith(".neon.tech")
  if (!allowedHost) throw new UnsafeTestDatabaseError(`host "${target.host}" is neither this machine nor a Neon host.`)
  const denied = (env.TANY_PRODUCTION_DB_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean)
  if (denied.includes(target.host)) throw new UnsafeTestDatabaseError("the host is listed in TANY_PRODUCTION_DB_HOSTS.")
  const appTarget = (() => {
    try {
      return env.DATABASE_URL ? parseTestDatabaseUrl(env.DATABASE_URL) : undefined
    } catch {
      return undefined
    }
  })()
  if (appTarget && sameTarget(target, appTarget)) throw new UnsafeTestDatabaseError("it is the same host and database as DATABASE_URL.")
  return { url, target }
}

/** The connection string live-database tests use. Undefined means "skip"; an unsafe setting throws, so it can never run silently. */
export function testDatabaseUrl(env: Env = process.env): string | undefined {
  return checkTestDatabaseConfig(env)?.url
}

type Row = { db: string; usr: string; super: boolean; note: string | null }
export type Query = (sql: string) => Promise<Row[]>

/**
 * The checks only the server can answer. Run once per test run (tests/support/global-setup.ts) before any test file starts.
 * `query` is injectable so the checks themselves are tested without a database.
 */
export async function assertDisposableDatabase(target: TestDatabaseIdentity, query: Query): Promise<void> {
  const [row] = await query(
    `select current_database() as db, current_user as usr,
            coalesce((select rolsuper from pg_roles where rolname = current_user), true) as super,
            (select shobj_description(oid, 'pg_database') from pg_database where datname = current_database()) as note`,
  )
  if (!row) throw new UnsafeTestDatabaseError("the server answered nothing.")
  if (row.db !== target.database) throw new UnsafeTestDatabaseError(`connected to "${row.db}", not "${target.database}".`)
  if (row.usr !== target.user) throw new UnsafeTestDatabaseError(`connected as "${row.usr}", not "${target.user}".`)
  if (row.super) throw new UnsafeTestDatabaseError(`role "${row.usr}" is a superuser. Use a restricted role.`)
  if (row.note !== DISPOSABLE_MARKER) throw new UnsafeTestDatabaseError(`database "${row.db}" is not marked disposable. As its owner run: COMMENT ON DATABASE "${row.db}" IS '${DISPOSABLE_MARKER}';`)
}

/** Connects with node-postgres (plain TCP, which both local Postgres and Neon accept) and runs assertDisposableDatabase. */
export async function assertDisposableDatabaseAt(url: string, target: TestDatabaseIdentity): Promise<void> {
  const { Client } = await import("pg")
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 15_000 })
  try {
    await client.connect()
    await assertDisposableDatabase(target, async (sql) => (await client.query(sql)).rows as Row[])
  } finally {
    await client.end().catch(() => {})
  }
}

/** The SQL that makes a database eligible. Contains no secrets; the password is yours to choose and never printed. */
export function setupSql(database = "tany_test", role = "tany_test_user"): string {
  return [
    `-- Run as the project owner, on a SEPARATE staging/test project (never production, never a branch of it).`,
    `CREATE ROLE ${role} LOGIN PASSWORD '<choose-a-long-random-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE;`,
    `CREATE DATABASE ${database} OWNER ${role};`,
    `COMMENT ON DATABASE ${database} IS '${DISPOSABLE_MARKER}';`,
  ].join("\n")
}
