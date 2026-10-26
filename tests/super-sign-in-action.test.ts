// The super admin sign-in action: only a Firebase-verified team email may even start a session, and (when set) only a listed uid.
import { beforeEach, describe, expect, it, vi } from "vitest"

const signIn = vi.fn(async () => {})
let identity: unknown = null
vi.mock("next/headers", () => ({ cookies: async () => ({ set() {}, delete() {} }) }))
vi.mock("next/navigation", () => ({ redirect: () => {} }))
vi.mock("../lib/core/rate-limit", () => ({ rateLimit: async () => true }))
vi.mock("../lib/auth", () => ({ signIn }))
vi.mock("../lib/auth/firebase", () => ({ verifyFirebaseIdToken: async () => identity }))

const TEAM = "founder@tany.test"
const run = async () => (await import("../lib/super/actions")).signInSuperAdmin("token")

describe("signInSuperAdmin", () => {
  beforeEach(() => {
    signIn.mockClear()
    process.env.SUPER_ADMIN_EMAILS = TEAM
    delete process.env.SUPER_ADMIN_UIDS
  })
  it("starts a session for a verified team email", async () => {
    identity = { uid: "u1", email: TEAM, emailVerified: true }
    expect((await run()).ok).toBe(true)
    expect(signIn).toHaveBeenCalledTimes(1)
  })
  it("refuses an unverified team email, a non-team email and an invalid token", async () => {
    for (const id of [{ uid: "u1", email: TEAM, emailVerified: false }, { uid: "u1", email: "dealer@shop.test", emailVerified: true }, null]) {
      identity = id
      expect((await run()).ok).toBe(false)
    }
    expect(signIn).not.toHaveBeenCalled()
  })
  it("with a uid list, refuses a team email signed in as another account before any session starts", async () => {
    process.env.SUPER_ADMIN_UIDS = "u1"
    identity = { uid: "u-other", email: TEAM, emailVerified: true }
    expect((await run()).ok).toBe(false)
    expect(signIn).not.toHaveBeenCalled()
    identity = { uid: "u1", email: TEAM, emailVerified: true }
    expect((await run()).ok).toBe(true)
  })
})
