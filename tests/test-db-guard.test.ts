import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  assertDisposableDatabase,
  checkTestDatabaseConfig,
  DISPOSABLE_MARKER,
  parseTestDatabaseUrl,
  setupSql,
  testDatabaseUrl,
  UnsafeTestDatabaseError,
} from "./support/disposable-db"

const LOCAL = "postgres://tany_test_user:pw@127.0.0.1:5432/tany_test"
const NEON = "postgres://tany_test_user:pw@ep-quiet-sun-123456-pooler.ap-south-1.aws.neon.tech/tany_test?sslmode=require"
const ok = (url: string, extra: Record<string, string> = {}) => ({ TEST_DATABASE_URL: url, TEST_DATABASE_DISPOSABLE: "1", TEST_DATABASE_CONFIRM: parseTestDatabaseUrl(url).database, ...extra })

describe("test database guard: configuration checks", () => {
  it("does nothing when no test database is configured, so live tests skip as before", () => {
    expect(checkTestDatabaseConfig({})).toBeUndefined()
    expect(testDatabaseUrl({ TEST_DATABASE_URL: "  " })).toBeUndefined()
  })

  it("accepts a local disposable database and a Neon one", () => {
    expect(checkTestDatabaseConfig(ok(LOCAL))?.target).toEqual({ host: "127.0.0.1", port: "5432", database: "tany_test", user: "tany_test_user" })
    expect(testDatabaseUrl(ok(NEON))).toBe(NEON)
  })

  const rejected: [string, Record<string, string | undefined>, RegExp][] = [
    ["no opt-in", { ...ok(LOCAL), TEST_DATABASE_DISPOSABLE: undefined }, /TEST_DATABASE_DISPOSABLE=1/],
    ["opt-in that is not exactly 1", { ...ok(LOCAL), TEST_DATABASE_DISPOSABLE: "true" }, /TEST_DATABASE_DISPOSABLE=1/],
    ["no typed confirmation", { ...ok(LOCAL), TEST_DATABASE_CONFIRM: undefined }, /TEST_DATABASE_CONFIRM=tany_test/],
    ["a confirmation for a different database", { ...ok(LOCAL), TEST_DATABASE_CONFIRM: "other_test" }, /TEST_DATABASE_CONFIRM/],
    ["a database not named for testing", ok("postgres://tany_test_user:pw@127.0.0.1/tany"), /must contain test/],
    ["the default Neon database name", ok("postgres://tany_test_user:pw@ep-x.neon.tech/neondb"), /must contain test/],
    ["a word merely containing test", ok("postgres://tany_test_user:pw@127.0.0.1/contest"), /must contain test/],
    ["a production database that also says test", ok("postgres://tany_test_user:pw@127.0.0.1/tany_prod_test"), /prod/],
    ["a production host", ok("postgres://tany_test_user:pw@ep-prod-1.neon.tech/tany_test"), /prod/],
    ["an owner role", ok("postgres://neondb_owner:pw@ep-x.neon.tech/tany_test"), /owner role/],
    ["postgres", ok("postgres://postgres:pw@127.0.0.1/tany_test"), /owner role/],
    ["a role not named for testing", ok("postgres://app_user:pw@127.0.0.1/tany_test"), /role name/],
    ["a remote host that is not Neon", ok("postgres://tany_test_user:pw@db.example.com/tany_test"), /neither this machine nor a Neon host/],
    ["a lookalike Neon host", ok("postgres://tany_test_user:pw@ep-x.neon.tech.evil.com/tany_test"), /neither this machine nor a Neon host/],
    ["a host on the production deny list", ok(NEON, { TANY_PRODUCTION_DB_HOSTS: "other.neon.tech, ep-quiet-sun-123456-pooler.ap-south-1.aws.neon.tech" }), /TANY_PRODUCTION_DB_HOSTS/],
    ["the same host and database as DATABASE_URL", ok(LOCAL, { DATABASE_URL: "postgres://app:secret@127.0.0.1:5432/tany_test?sslmode=disable" }), /same host and database as DATABASE_URL/],
    ["NODE_ENV=production", ok(LOCAL, { NODE_ENV: "production" }), /NODE_ENV/],
    ["a URL that is not a URL", ok(LOCAL, { TEST_DATABASE_URL: "not a url" }), /valid URL/],
    ["a non-postgres scheme", ok(LOCAL, { TEST_DATABASE_URL: "mysql://tany_test_user@127.0.0.1/tany_test" }), /postgres/],
    ["no database in the URL", ok(LOCAL, { TEST_DATABASE_URL: "postgres://tany_test_user:pw@127.0.0.1:5432/" }), /names no database/],
  ]
  it.each(rejected)("rejects %s", (_name, env, message) => {
    expect(() => checkTestDatabaseConfig(env)).toThrow(UnsafeTestDatabaseError)
    expect(() => checkTestDatabaseConfig(env)).toThrow(message)
    expect(() => testDatabaseUrl(env)).toThrow(UnsafeTestDatabaseError) // the helper every test file uses fails loudly, never skips quietly
  })

  it("never puts the password in an error", () => {
    for (const [, env] of rejected) {
      try {
        checkTestDatabaseConfig(env)
      } catch (e) {
        expect(String((e as Error).message)).not.toContain(":pw@")
        expect(String((e as Error).message)).not.toContain("secret")
      }
    }
  })

  it("does not mind an unparseable DATABASE_URL (it only has to differ)", () => {
    expect(checkTestDatabaseConfig(ok(LOCAL, { DATABASE_URL: "garbage" }))).toBeDefined()
  })
})

describe("test database guard: checks only the server can answer", () => {
  const target = parseTestDatabaseUrl(LOCAL)
  const row = (over: Partial<{ db: string; usr: string; super: boolean; note: string | null }> = {}) => ({ db: "tany_test", usr: "tany_test_user", super: false, note: DISPOSABLE_MARKER, ...over })

  it("passes for a marked database and a restricted role", async () => {
    await expect(assertDisposableDatabase(target, async () => [row()])).resolves.toBeUndefined()
  })
  it.each([
    ["an unmarked database", { note: null }, /not marked disposable/],
    ["a database with some other comment", { note: "production" }, /not marked disposable/],
    ["a superuser role", { super: true }, /superuser/],
    ["a different database than the URL named", { db: "tany" }, /not "tany_test"/],
    ["a different role than the URL named", { usr: "postgres" }, /not "tany_test_user"/],
  ])("rejects %s", async (_name, over, message) => {
    await expect(assertDisposableDatabase(target, async () => [row(over)])).rejects.toThrow(message)
  })
  it("rejects an empty answer", async () => {
    await expect(assertDisposableDatabase(target, async () => [])).rejects.toThrow(UnsafeTestDatabaseError)
  })
  it("setup SQL carries the marker and no password", () => {
    expect(setupSql()).toContain(`COMMENT ON DATABASE tany_test IS '${DISPOSABLE_MARKER}'`)
    expect(setupSql()).toContain("NOSUPERUSER")
    expect(setupSql()).toContain("<choose-a-long-random-password>")
  })
})

describe("test database guard: no test can bypass it", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))
  const testFiles = files("tests").filter((f) => f.endsWith(".ts") && !f.startsWith(join("tests", "support")) && f !== join("tests", "test-db-guard.test.ts"))

  it("finds the live-database test files", () => {
    expect(testFiles.filter((f) => readFileSync(f, "utf8").includes("TEST_DATABASE_URL")).length).toBeGreaterThanOrEqual(10)
  })
  it("no test file reads the database URL from the environment itself", () => {
    const offenders = testFiles.filter((f) => /process\.env\.TEST_DATABASE_URL|env\[["']TEST_DATABASE_URL/.test(readFileSync(f, "utf8")))
    expect(offenders).toEqual([])
  })
  it("every live-database test file gets its URL from the guard", () => {
    const live = testFiles.filter((f) => /describe\.skipIf\(!url\)/.test(readFileSync(f, "utf8")))
    expect(live.length).toBeGreaterThanOrEqual(10)
    for (const f of live) expect(readFileSync(f, "utf8"), f).toMatch(/const url = testDatabaseUrl\(\)/)
  })
  it("the run itself is gated by the guard before any test starts", () => {
    expect(readFileSync("vitest.config.ts", "utf8")).toContain("tests/support/global-setup.ts")
  })
})
