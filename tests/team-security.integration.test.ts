// Live test: hasOwnSignIn tells accounts a person created by signing in from accounts provisioned for them.
// Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated database (see docs/staging/neon-test-database.md).
import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()

describe.skipIf(!url)("team: hasOwnSignIn (live database)", () => {
  let team: typeof import("../lib/tenant/team")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    team = await import("../lib/tenant/team")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
  })
  afterAll(async () => {
    await pool.end()
  })

  it("is false for a row an owner provisioned and true once the person has a linked sign-in", async () => {
    const [provisioned] = await unscopedDb.insert(s.users).values({ name: "Provisioned", email: `prov-${tag}@example.test`, phone: `+9190000${tag.slice(0, 5).replace(/\D/g, "1").padEnd(5, "1")}` }).returning()
    const [self] = await unscopedDb.insert(s.users).values({ name: "Self", email: `self-${tag}@example.test` }).returning()
    await unscopedDb.insert(s.accounts).values({ userId: self.id, type: "oidc", provider: "firebase", providerAccountId: `uid-${tag}` })
    expect(await team.hasOwnSignIn(provisioned.id)).toBe(false)
    expect(await team.hasOwnSignIn(self.id)).toBe(true)
  })
})
