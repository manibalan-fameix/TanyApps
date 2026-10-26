// Live test: staff invitations and verified identity ownership. Runs only when TEST_DATABASE_URL points at a DISPOSABLE, migrated
// database (see docs/staging/neon-test-database.md). No Firebase or network: the "verified identity" is exactly what the app reads from a
// session after a Firebase sign-in (see lib/auth/session-claims.ts), supplied directly.
import { randomBytes, randomInt } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { testDatabaseUrl } from "./support/disposable-db"

const url = testDatabaseUrl()
const ctxState = vi.hoisted(() => ({ ctx: null as unknown }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/core/rate-limit", () => ({ rateLimit: async () => true }))
vi.mock("@/lib/auth/context", () => ({ getDealerContext: async () => ctxState.ctx }))

describe.skipIf(!url)("team invitations and identity ownership (live database)", () => {
  let inv: typeof import("../lib/tenant/invites")
  let actions: typeof import("../app/(admin)/(shell)/settings/team/actions")
  let fbUser: typeof import("../lib/auth/firebase-user")
  let teammate: typeof import("../lib/auth/teammate-login")
  let password: typeof import("../lib/auth/password")
  let unscopedDb: typeof import("../lib/db/client").unscopedDb
  let pool: typeof import("../lib/db/client").pool
  let s: typeof import("../lib/db/schema")
  const tag = randomBytes(3).toString("hex")
  let n = 0
  const theme = { primary: "#1d4ed8", primaryForeground: "#ffffff", accent: "#f59e0b", radius: "md" as const }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
    process.env.BLIND_INDEX_KEY = randomBytes(32).toString("base64")
    process.env.ROOT_DOMAIN = "tany.test"
    inv = await import("../lib/tenant/invites")
    actions = await import("../app/(admin)/(shell)/settings/team/actions")
    fbUser = await import("../lib/auth/firebase-user")
    teammate = await import("../lib/auth/teammate-login")
    password = await import("../lib/auth/password")
    ;({ unscopedDb, pool } = await import("../lib/db/client"))
    s = await import("../lib/db/schema")
  })
  afterAll(async () => {
    await pool.end()
  })

  const dealer = async (industry: "motors" | "restaurants" = "motors") => {
    const [d] = await unscopedDb.insert(s.dealers).values({ slug: `inv-${tag}-${++n}`, displayName: `Biz ${n}`, industry, theme }).returning()
    return d
  }
  const user = async (over: Partial<typeof import("../lib/db/schema").users.$inferInsert> = {}) => {
    const [u] = await unscopedDb.insert(s.users).values({ name: `U${++n}`, email: `u${n}-${tag}@example.test`, ...over }).returning()
    return u
  }
  const member = async (dealerId: string, userId: string, role: "owner" | "staff") => {
    await unscopedDb.insert(s.dealerUsers).values({ dealerId, userId, role })
  }
  const memberships = async (userId: string) => (await unscopedDb.select().from(s.dealerUsers).where(eq(s.dealerUsers.userId, userId))).map((m) => `${m.dealerId}:${m.role}`).sort()
  const invite = async (dealerId: string, ownerId: string, contact: string, now?: Date) => {
    const r = await inv.createInvite(dealerId, ownerId, contact, now)
    if (!r.ok) throw new Error(r.error)
    return r
  }
  const row = async (id: string) => (await unscopedDb.select().from(s.teamInvites).where(eq(s.teamInvites.id, id)))[0]

  describe("a valid invitation", () => {
    it("by email: the person signs in as themselves and joins that one business as staff", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const email = `new-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      const res = await inv.acceptInvite(made.token, person.id, { email, phone: null })
      expect(res).toEqual({ ok: true, dealerId: d.id, alreadyMember: false })
      expect(await memberships(person.id)).toEqual([`${d.id}:staff`])
      const r = await row(made.id)
      expect(r.acceptedBy).toBe(person.id)
      expect(r.acceptedAt).not.toBeNull()
      expect(await inv.listOpenInvites(d.id)).toHaveLength(0)
    })
    it("by phone: an OTP-verified number in any common spelling matches", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const made = await invite(d.id, owner.id, "98765 43210")
      expect((await inv.acceptInvite(made.token, person.id, { email: null, phone: "+919876543210" })).ok).toBe(true)
    })
    it("email matching ignores case and surrounding spaces", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const lower = `mixed.case-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, `  ${lower.toUpperCase().replace("EXAMPLE.TEST", "Example.TEST")} `)
      expect((await inv.acceptInvite(made.token, person.id, { email: lower, phone: null })).ok).toBe(true)
    })
    it("writes audit rows for creating and accepting, and never the token or the contact", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const email = `aud-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      await inv.acceptInvite(made.token, person.id, { email, phone: null })
      const rows = await unscopedDb.select().from(s.auditLog).where(and(eq(s.auditLog.dealerId, d.id), eq(s.auditLog.entityId, made.id)))
      expect(rows.map((r) => r.action).sort()).toEqual(["team.invite_accepted", "team.invite_created"])
      const text = JSON.stringify(rows)
      expect(text).not.toContain(made.token)
      expect(text).not.toContain(email)
      expect(rows.find((r) => r.action === "team.invite_accepted")?.actorId).toBe(person.id)
      expect(rows.find((r) => r.action === "team.invite_created")?.actorId).toBe(owner.id)
    })
    it("stores only a hash of the token and keyed hashes of the contact", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      const email = `store-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      const r = await row(made.id)
      expect(r.tokenHash).toBe(inv.hashInviteToken(made.token))
      expect(r.tokenHash).not.toBe(made.token)
      expect(JSON.stringify(r)).not.toContain(made.token)
      expect(JSON.stringify(r)).not.toContain(email)
      expect(r.contactEnc).not.toContain(email)
    })
  })

  describe("invitations that must not work", () => {
    it("an expired invitation is refused", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const email = `exp-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email, new Date(Date.now() - (inv.INVITE_TTL_DAYS + 1) * 86_400_000))
      expect(await inv.acceptInvite(made.token, person.id, { email, phone: null })).toEqual({ ok: false, error: "invalid" })
      expect(await memberships(person.id)).toEqual([])
    })
    it("a revoked invitation is refused, and revoking is recorded", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const email = `rev-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      expect(await inv.revokeInvite(d.id, owner.id, made.id)).toBe(true)
      expect(await inv.revokeInvite(d.id, owner.id, made.id)).toBe(false) // already closed
      expect(await inv.acceptInvite(made.token, person.id, { email, phone: null })).toEqual({ ok: false, error: "invalid" })
      expect((await row(made.id)).revokedBy).toBe(owner.id)
    })
    it("a replayed invitation cannot be used by anyone else, but the same person repeating it is harmless", async () => {
      const d = await dealer(), owner = await user(), person = await user(), other = await user()
      await member(d.id, owner.id, "owner")
      const email = `rep-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      expect((await inv.acceptInvite(made.token, person.id, { email, phone: null })).ok).toBe(true)
      expect(await inv.acceptInvite(made.token, other.id, { email, phone: null })).toEqual({ ok: false, error: "invalid" })
      expect(await memberships(other.id)).toEqual([])
      expect(await inv.acceptInvite(made.token, person.id, { email, phone: null })).toEqual({ ok: true, dealerId: d.id, alreadyMember: true })
      expect(await memberships(person.id)).toEqual([`${d.id}:staff`])
    })
    it("a removed teammate cannot rejoin by replaying the old link", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const email = `rm-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      await inv.acceptInvite(made.token, person.id, { email, phone: null })
      await unscopedDb.delete(s.dealerUsers).where(and(eq(s.dealerUsers.dealerId, d.id), eq(s.dealerUsers.userId, person.id)))
      // The invitation was consumed once. Repeating it neither recreates the removed membership nor reports success.
      expect(await inv.acceptInvite(made.token, person.id, { email, phone: null })).toEqual({ ok: false, error: "invalid" })
      expect(await memberships(person.id)).toEqual([])
    })
    it("forged, malformed and look-alike tokens are refused", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const email = `forge-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      const stored = (await row(made.id)).tokenHash
      const flipped = made.token.slice(0, -1) + (made.token.endsWith("A") ? "B" : "A")
      for (const t of [inv.newInviteToken(), "", "short", flipped, stored, made.token + "x", made.token.toLowerCase() === made.token ? made.token.toUpperCase() : made.token.toLowerCase(), "'; drop table team_invites; --".padEnd(43, "x")]) {
        expect(await inv.acceptInvite(t, person.id, { email, phone: null }), t).toEqual({ ok: false, error: "invalid" })
      }
      expect((await row(made.id)).acceptedAt).toBeNull() // none of them consumed it
    })
    it("the wrong verified identity is refused: another email, only a phone, no claim, or a matching profile email that was never verified", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      const email = `target-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      // This person's profile row carries the invited email, but Firebase verified nothing for them.
      const unverified = await user({ email })
      const stranger = await user()
      for (const [who, v] of [
        [stranger, { email: `other-${tag}@example.test`, phone: null }],
        [stranger, { email: null, phone: "+919876543210" }],
        [stranger, { email: null, phone: null }],
        [unverified, { email: null, phone: null }],
      ] as const) {
        expect(await inv.acceptInvite(made.token, who.id, v)).toEqual({ ok: false, error: "invalid" })
      }
      expect(await memberships(unverified.id)).toEqual([])
      expect((await row(made.id)).acceptedAt).toBeNull()
      // The right person still can.
      const real = await user()
      expect((await inv.acceptInvite(made.token, real.id, { email, phone: null })).ok).toBe(true)
    })
    it("an email invitation is not satisfied by a phone number and vice versa", async () => {
      const d = await dealer(), owner = await user(), p = await user()
      await member(d.id, owner.id, "owner")
      const byEmail = await invite(d.id, owner.id, `only-email-${tag}-${++n}@example.test`)
      const byPhone = await invite(d.id, owner.id, "91234 56789")
      expect((await inv.acceptInvite(byEmail.token, p.id, { email: null, phone: "+919123456789" })).ok).toBe(false)
      expect((await inv.acceptInvite(byPhone.token, p.id, { email: `only-email-${tag}@example.test`, phone: null })).ok).toBe(false)
    })
  })

  describe("concurrency", () => {
    it("ten simultaneous acceptances by the same person create one membership, one acceptance and one audit row", async () => {
      const d = await dealer(), owner = await user(), person = await user()
      await member(d.id, owner.id, "owner")
      const email = `conc-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      const results = await Promise.all(Array.from({ length: 10 }, () => inv.acceptInvite(made.token, person.id, { email, phone: null })))
      expect(results.every((r) => r.ok)).toBe(true)
      expect(results.filter((r) => r.ok && !r.alreadyMember)).toHaveLength(1)
      expect(await memberships(person.id)).toEqual([`${d.id}:staff`])
      const audits = await unscopedDb.select().from(s.auditLog).where(and(eq(s.auditLog.entityId, made.id), eq(s.auditLog.action, "team.invite_accepted")))
      expect(audits).toHaveLength(1)
    })
    it("simultaneous acceptance by two different accounts claiming the same identity lets exactly one win", async () => {
      const d = await dealer(), owner = await user(), a = await user(), b = await user()
      await member(d.id, owner.id, "owner")
      const email = `race-${tag}-${++n}@example.test`
      const made = await invite(d.id, owner.id, email)
      const results = await Promise.all([inv.acceptInvite(made.token, a.id, { email, phone: null }), inv.acceptInvite(made.token, b.id, { email, phone: null })])
      expect(results.filter((r) => r.ok)).toHaveLength(1)
      const total = (await memberships(a.id)).length + (await memberships(b.id)).length
      expect(total).toBe(1)
    })
    it("simultaneous invitations for the same contact leave one open invitation", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      const email = `dup-${tag}-${++n}@example.test`
      const made = await Promise.allSettled(Array.from({ length: 5 }, () => inv.createInvite(d.id, owner.id, email)))
      expect(made.some((m) => m.status === "fulfilled")).toBe(true)
      expect(await inv.listOpenInvites(d.id)).toHaveLength(1)
    })
  })

  describe("existing accounts and several businesses", () => {
    it("a person who already belongs to another business gains only the invited membership; nothing about their account changes", async () => {
      const a = await dealer(), b = await dealer("restaurants"), ownerA = await user(), ownerB = await user()
      const hash = await password.hashPassword("their-own-password-1")
      const email = `multi-${tag}-${++n}@example.test`
      const person = await user({ email, passwordHash: hash, phone: `+919${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}` })
      await unscopedDb.insert(s.accounts).values({ userId: person.id, type: "oidc", provider: "firebase", providerAccountId: `uid-${tag}-${n}` })
      await member(a.id, ownerA.id, "owner")
      await member(b.id, ownerB.id, "owner")
      await member(b.id, person.id, "owner") // they own business B
      const before = (await unscopedDb.select().from(s.users).where(eq(s.users.id, person.id)))[0]
      const accountsBefore = await unscopedDb.select().from(s.accounts).where(eq(s.accounts.userId, person.id))

      const made = await invite(a.id, ownerA.id, email)
      expect((await inv.acceptInvite(made.token, person.id, { email, phone: null })).ok).toBe(true)

      expect(await memberships(person.id)).toEqual([`${a.id}:staff`, `${b.id}:owner`].sort()) // B stays owner, A is staff
      expect((await unscopedDb.select().from(s.users).where(eq(s.users.id, person.id)))[0]).toEqual(before) // password, email, phone untouched
      expect(await unscopedDb.select().from(s.accounts).where(eq(s.accounts.userId, person.id))).toEqual(accountsBefore) // provider links untouched
    })
    it("membership in one business grants nothing in another: each invitation is bound to its business", async () => {
      const a = await dealer(), b = await dealer(), ownerA = await user(), ownerB = await user(), p = await user()
      await member(a.id, ownerA.id, "owner")
      await member(b.id, ownerB.id, "owner")
      const email = `bound-${tag}-${++n}@example.test`
      const madeA = await invite(a.id, ownerA.id, email)
      const res = await inv.acceptInvite(madeA.token, p.id, { email, phone: null })
      expect(res).toMatchObject({ ok: true, dealerId: a.id })
      expect(await memberships(p.id)).toEqual([`${a.id}:staff`])
      // Business B's own data is not visible through A's invitations or lists.
      expect(await inv.listOpenInvites(b.id)).toHaveLength(0)
    })
    it("an owner of one business cannot see, revoke or consume another business's invitations", async () => {
      const a = await dealer(), b = await dealer(), ownerA = await user(), ownerB = await user()
      await member(a.id, ownerA.id, "owner")
      await member(b.id, ownerB.id, "owner")
      const madeB = await invite(b.id, ownerB.id, `iso-${tag}-${++n}@example.test`)
      expect(await inv.listOpenInvites(a.id)).toHaveLength(0)
      expect(await inv.revokeInvite(a.id, ownerA.id, madeB.id)).toBe(false)
      expect((await row(madeB.id)).revokedAt).toBeNull()
      // Through the server action as business A's owner:
      ctxState.ctx = { status: "ok", dealerInDb: true, role: "owner", user: { id: ownerA.id, name: null, email: null }, dealer: { id: a.id } }
      expect(await actions.revokeInvitation(madeB.id)).toEqual({ ok: false, error: "That invitation is no longer open." })
      expect((await row(madeB.id)).revokedAt).toBeNull()
    })
    it("the same email invited by two businesses gives two independent invitations", async () => {
      const a = await dealer(), b = await dealer(), ownerA = await user(), ownerB = await user(), p = await user()
      await member(a.id, ownerA.id, "owner")
      await member(b.id, ownerB.id, "owner")
      const email = `shared-${tag}-${++n}@example.test`
      const ia = await invite(a.id, ownerA.id, email)
      const ib = await invite(b.id, ownerB.id, email)
      expect((await inv.acceptInvite(ia.token, p.id, { email, phone: null })).ok).toBe(true)
      expect((await row(ib.id)).acceptedAt).toBeNull() // B's invitation is still open
      expect(await memberships(p.id)).toEqual([`${a.id}:staff`])
    })
  })

  describe("owners never hold or reserve anyone else's credentials", () => {
    it("inviting someone's email creates no account, touches no account, and sets no credential", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      const victimEmail = `victim-${tag}-${++n}@example.test`
      const victim = await user({ email: victimEmail, passwordHash: null })
      const usersBefore = await unscopedDb.select().from(s.users)
      const victimBefore = usersBefore.find((u) => u.id === victim.id)
      await invite(d.id, owner.id, victimEmail)
      await invite(d.id, owner.id, "90000 11122") // and a number nobody has registered
      const usersAfter = await unscopedDb.select().from(s.users)
      expect(usersAfter).toHaveLength(usersBefore.length) // no user row was created
      expect(usersAfter.find((u) => u.id === victim.id)).toEqual(victimBefore) // and the victim's row is byte-identical
      expect(await memberships(victim.id)).toEqual([]) // no membership either: only the victim's own acceptance can add it
    })
    it("the action surface has no way to create accounts or set or reset passwords", async () => {
      const exported = Object.keys(actions).sort()
      expect(exported).toEqual(["inviteTeammate", "removeTeammate", "revokeInvitation"])
    })
    it("the owner-provisioned password path is closed: signing in as a legacy teammate stops once the real person verifies their identity", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      const email = `legacy-${tag}-${++n}@example.test`
      const hash = await password.hashPassword("owner-chose-this-1")
      const legacy = await user({ email, passwordHash: hash, name: "Legacy Staff" })
      await member(d.id, legacy.id, "staff")
      // Before: the owner-set password still works, so existing staff are not locked out.
      expect((await teammate.authenticateTeammate(email, "owner-chose-this-1"))?.id).toBe(legacy.id)

      // An unverified Firebase email (someone typing the address) neither signs in nor clears anything.
      const typed = await fbUser.findOrCreateFirebaseUser({ uid: `uid-typed-${tag}-${n}`, email, emailVerified: false, phone: null, name: "Typed", picture: null, provider: "password" })
      expect(typed?.id).not.toBe(legacy.id)
      expect((await teammate.authenticateTeammate(email, "owner-chose-this-1"))?.id).toBe(legacy.id)

      // The real person proves the address. The account is theirs and the owner's password stops working.
      const real = await fbUser.findOrCreateFirebaseUser({ uid: `uid-real-${tag}-${n}`, email, emailVerified: true, phone: null, name: "Real", picture: null, provider: "google.com" })
      expect(real?.id).toBe(legacy.id)
      expect(await teammate.authenticateTeammate(email, "owner-chose-this-1")).toBeNull()
      const after = (await unscopedDb.select().from(s.users).where(eq(s.users.id, legacy.id)))[0]
      expect(after.passwordHash).toBeNull()
      expect((await unscopedDb.select().from(s.accounts).where(eq(s.accounts.userId, legacy.id))).map((a) => a.providerAccountId)).toEqual([`uid-real-${tag}-${n}`])
      expect(await memberships(legacy.id)).toEqual([`${d.id}:staff`]) // their membership continues
      // A later sign-in finds the account by its Firebase link.
      expect((await fbUser.findOrCreateFirebaseUser({ uid: `uid-real-${tag}-${n}`, email: null, emailVerified: false, phone: null, name: null, picture: null, provider: "google.com" }))?.id).toBe(legacy.id)
    })
    it("the read-only account lookup used by the login page never changes anything", async () => {
      const email = `ro-${tag}-${++n}@example.test`
      const hash = await password.hashPassword("owner-chose-this-2")
      const legacy = await user({ email, passwordHash: hash })
      const found = await fbUser.findFirebaseUser({ uid: `uid-ro-${tag}-${n}`, email, emailVerified: true, phone: null, name: null, picture: null, provider: "google.com" })
      expect(found?.id).toBe(legacy.id)
      expect((await unscopedDb.select().from(s.users).where(eq(s.users.id, legacy.id)))[0].passwordHash).toBe(hash)
      expect(await unscopedDb.select().from(s.accounts).where(eq(s.accounts.userId, legacy.id))).toHaveLength(0)
    })
  })

  describe("roles", () => {
    it("an invitation can only carry the staff role: the database refuses anything else", async () => {
      const d = await dealer(), owner = await user()
      await expect(
        unscopedDb.execute(sql`insert into team_invites (dealer_id, role, token_hash, email_hash, contact_enc, expires_at) values (${d.id}, 'owner', ${"h" + tag + "x"}, 'e', 'c', now() + interval '1 day')`),
      ).rejects.toThrow()
      await member(d.id, owner.id, "owner")
      const made = await invite(d.id, owner.id, `role-${tag}-${++n}@example.test`)
      expect((await row(made.id)).role).toBe("staff")
    })
    it("accepting never changes an existing role: an owner stays owner, staff stays staff", async () => {
      const d = await dealer(), owner = await user(), staff = await user()
      await member(d.id, owner.id, "owner")
      await member(d.id, staff.id, "staff")
      const ownerEmail = `own-${tag}-${++n}@example.test`
      const staffEmail = `stf-${tag}-${++n}@example.test`
      const toOwner = await invite(d.id, owner.id, ownerEmail)
      const toStaff = await invite(d.id, owner.id, staffEmail)
      expect((await inv.acceptInvite(toOwner.token, owner.id, { email: ownerEmail, phone: null })).ok).toBe(true)
      expect((await inv.acceptInvite(toStaff.token, staff.id, { email: staffEmail, phone: null })).ok).toBe(true)
      expect(await memberships(owner.id)).toEqual([`${d.id}:owner`])
      expect(await memberships(staff.id)).toEqual([`${d.id}:staff`])
    })
    it("only an owner can invite or revoke: a staff member and a signed-out caller are refused", async () => {
      const d = await dealer(), owner = await user(), staff = await user()
      await member(d.id, owner.id, "owner")
      await member(d.id, staff.id, "staff")
      const made = await invite(d.id, owner.id, `act-${tag}-${++n}@example.test`)
      ctxState.ctx = { status: "ok", dealerInDb: true, role: "staff", user: { id: staff.id, name: null, email: null }, dealer: { id: d.id } }
      expect(await actions.inviteTeammate("someone@example.test")).toEqual({ ok: false, error: "Only the owner can manage the team." })
      expect(await actions.revokeInvitation(made.id)).toEqual({ ok: false, error: "Only the owner can manage the team." })
      ctxState.ctx = { status: "anonymous" }
      expect((await actions.inviteTeammate("someone@example.test")).ok).toBe(false)
      expect((await row(made.id)).revokedAt).toBeNull()
      ctxState.ctx = { status: "ok", dealerInDb: true, role: "owner", user: { id: owner.id, name: null, email: null }, dealer: { id: d.id } }
      const ok = await actions.inviteTeammate(`via-action-${tag}-${++n}@example.test`)
      expect(ok.ok).toBe(true)
      if (ok.ok) expect(ok.link).toMatch(/^https?:\/\/app\.tany\.test\/invite\/[A-Za-z0-9_-]{43}$/)
    })
  })

  describe("no account enumeration", () => {
    it("creating an invitation answers the same for an email that has an account and one that has none", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      const existing = await user({ email: `has-acct-${tag}-${++n}@example.test` })
      ctxState.ctx = { status: "ok", dealerInDb: true, role: "owner", user: { id: owner.id, name: null, email: null }, dealer: { id: d.id } }
      const a = await actions.inviteTeammate(existing.email!)
      const b = await actions.inviteTeammate(`nobody-${tag}-${++n}@example.test`)
      expect(a.ok).toBe(true)
      expect(b.ok).toBe(true)
      expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
    })
    it("every way an invitation can fail returns the identical answer", async () => {
      const d = await dealer(), owner = await user(), p = await user()
      await member(d.id, owner.id, "owner")
      const email = `same-${tag}-${++n}@example.test`
      const expired = await invite(d.id, owner.id, `x1-${tag}-${n}@example.test`, new Date(Date.now() - 30 * 86_400_000))
      const revoked = await invite(d.id, owner.id, `x2-${tag}-${n}@example.test`)
      await inv.revokeInvite(d.id, owner.id, revoked.id)
      const live = await invite(d.id, owner.id, email)
      const answers = await Promise.all([
        inv.acceptInvite(inv.newInviteToken(), p.id, { email, phone: null }), // unknown
        inv.acceptInvite("not-a-token", p.id, { email, phone: null }), // malformed
        inv.acceptInvite(expired.token, p.id, { email: `x1-${tag}-${n}@example.test`, phone: null }), // expired
        inv.acceptInvite(revoked.token, p.id, { email: `x2-${tag}-${n}@example.test`, phone: null }), // revoked
        inv.acceptInvite(live.token, p.id, { email: "wrong@example.test", phone: null }), // wrong person
      ])
      for (const a of answers) expect(a).toEqual({ ok: false, error: "invalid" })
    })
  })

  describe("limits and bookkeeping", () => {
    it("inviting the same contact again replaces the earlier link", async () => {
      const d = await dealer(), owner = await user(), p = await user()
      await member(d.id, owner.id, "owner")
      const email = `again-${tag}-${++n}@example.test`
      const first = await invite(d.id, owner.id, email)
      const second = await invite(d.id, owner.id, email)
      expect((await row(first.id)).revokedAt).not.toBeNull()
      expect((await inv.acceptInvite(first.token, p.id, { email, phone: null })).ok).toBe(false)
      expect((await inv.acceptInvite(second.token, p.id, { email, phone: null })).ok).toBe(true)
    })
    it("a business cannot hold more than the allowed number of open invitations", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      for (let i = 0; i < inv.MAX_OPEN_INVITES; i++) await invite(d.id, owner.id, `bulk-${tag}-${i}-${n}@example.test`)
      expect(await inv.createInvite(d.id, owner.id, `one-more-${tag}@example.test`)).toEqual({ ok: false, error: "too_many" })
    })
    it("rejects contacts that are neither an email nor an Indian mobile number", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      for (const bad of ["", "   ", "not an email", "12345", "+14155550123", "a@b", 42, null, undefined]) {
        expect(await inv.createInvite(d.id, owner.id, bad)).toEqual({ ok: false, error: "invalid_contact" })
      }
    })
    it("peekInvite shows the business name only while the invitation is usable", async () => {
      const d = await dealer(), owner = await user()
      await member(d.id, owner.id, "owner")
      const made = await invite(d.id, owner.id, `peek-${tag}-${++n}@example.test`)
      expect(await inv.peekInvite(made.token)).toEqual({ businessName: d.displayName })
      await inv.revokeInvite(d.id, owner.id, made.id)
      expect(await inv.peekInvite(made.token)).toBeNull()
      expect(await inv.peekInvite("garbage")).toBeNull()
    })
  })
})
