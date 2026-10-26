// The Tany team area must be reachable only by an email Firebase verified at sign-in. A profile email alone proves nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let session: unknown = null
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`)
  },
  notFound: () => {
    throw new Error("notFound")
  },
}))
vi.mock("../lib/auth", () => ({ auth: async () => session }))

const TEAM = "founder@tany.test"

async function guard() {
  vi.resetModules()
  process.env.SUPER_ADMIN_EMAILS = `${TEAM}, other@tany.test`
  return import("../lib/super/guard")
}

describe("requireSuperAdmin", () => {
  beforeEach(() => {
    session = null
  })

  it("lets in a team address that Firebase verified at sign-in", async () => {
    session = { user: { email: TEAM }, verifiedEmail: TEAM }
    const { requireSuperAdmin } = await guard()
    await expect(requireSuperAdmin()).resolves.toEqual({ email: TEAM })
  })

  it("rejects a teammate-password session that only carries a matching users.email", async () => {
    session = { user: { email: TEAM }, verifiedEmail: null }
    const { requireSuperAdmin } = await guard()
    await expect(requireSuperAdmin()).rejects.toThrow("redirect:/super/login")
  })

  it("rejects a session from before the claim existed", async () => {
    session = { user: { email: TEAM } }
    const { requireSuperAdmin } = await guard()
    await expect(requireSuperAdmin()).rejects.toThrow("redirect:/super/login")
  })

  it("answers 404 to a verified address that is not on the team list", async () => {
    session = { user: { email: "dealer@shop.test" }, verifiedEmail: "dealer@shop.test" }
    const { requireSuperAdmin } = await guard()
    await expect(requireSuperAdmin()).rejects.toThrow("notFound")
  })

  it("does not trust users.email even when a different address was verified", async () => {
    session = { user: { email: TEAM }, verifiedEmail: "dealer@shop.test" }
    const { requireSuperAdmin } = await guard()
    await expect(requireSuperAdmin()).rejects.toThrow("notFound")
  })

  it("currentSuperAdmin never reports an unverified session", async () => {
    session = { user: { email: TEAM }, verifiedEmail: null }
    const { currentSuperAdmin } = await guard()
    expect(await currentSuperAdmin()).toBeNull()
  })
})

// ---------- stable uid allow-list (optional second factor) ----------

describe("SUPER_ADMIN_UIDS", () => {
  beforeEach(() => {
    session = null
  })
  afterEach(() => {
    delete process.env.SUPER_ADMIN_UIDS
  })
  const withUids = async (uids: string | undefined) => {
    const g = await guard()
    if (uids === undefined) delete process.env.SUPER_ADMIN_UIDS
    else process.env.SUPER_ADMIN_UIDS = uids
    return g
  }

  it("is not required when unset", async () => {
    session = { user: {}, verifiedEmail: TEAM, verifiedUid: "anyone" }
    const { requireSuperAdmin } = await withUids(undefined)
    await expect(requireSuperAdmin()).resolves.toEqual({ email: TEAM })
  })
  it("admits the listed uid with a team email", async () => {
    session = { user: {}, verifiedEmail: TEAM, verifiedUid: "uid-founder" }
    const { requireSuperAdmin } = await withUids("uid-founder, uid-other")
    await expect(requireSuperAdmin()).resolves.toEqual({ email: TEAM })
  })
  it("refuses a team email signed in as a different Firebase account", async () => {
    session = { user: {}, verifiedEmail: TEAM, verifiedUid: "uid-other" }
    const { requireSuperAdmin } = await withUids("uid-founder")
    await expect(requireSuperAdmin()).rejects.toThrow("notFound")
  })
  it("refuses a session with no uid claim when a list is configured", async () => {
    session = { user: {}, verifiedEmail: TEAM }
    const { requireSuperAdmin } = await withUids("uid-founder")
    await expect(requireSuperAdmin()).rejects.toThrow("notFound")
  })
  it("a listed uid alone is not enough: the verified email must be on the team list too", async () => {
    session = { user: {}, verifiedEmail: "dealer@shop.test", verifiedUid: "uid-founder" }
    const { requireSuperAdmin } = await withUids("uid-founder")
    await expect(requireSuperAdmin()).rejects.toThrow("notFound")
  })
})

// ---------- verified-email semantics ----------

describe("verifiedEmailOf", () => {
  it("returns the email only when Firebase says it is verified", async () => {
    const { verifiedEmailOf } = await import("../lib/auth/firebase")
    expect(verifiedEmailOf({ email: TEAM, emailVerified: true })).toBe(TEAM)
    expect(verifiedEmailOf({ email: TEAM, emailVerified: false })).toBeNull()
    expect(verifiedEmailOf({ email: null, emailVerified: true })).toBeNull()
  })
})

// ---------- structural: no /super entry point may be left unguarded ----------

import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(__dirname, "..")
const files = (dir: string, re: RegExp, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) {
    const f = path.join(dir, n)
    if (statSync(f).isDirectory()) files(f, re, out)
    else if (re.test(n)) out.push(f)
  }
  return out
}

describe("every /super entry point enforces the guard on the server", () => {
  it("each exported async function in lib/super/data.ts and queries.ts calls requireSuperAdmin first", () => {
    const bad: string[] = []
    for (const rel of ["lib/super/data.ts", "lib/super/queries.ts"]) {
      const s = readFileSync(path.join(ROOT, rel), "utf8")
      for (const m of s.matchAll(/export async function (\w+)[^{]*\{/g)) {
        const head = s.slice(m.index! + m[0].length, m.index! + m[0].length + 300)
        if (!/await requireSuperAdmin\(\)/.test(head)) bad.push(`${rel}:${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })

  it("server actions and route handlers under app/(super) call the guard", () => {
    const bad = files(path.join(ROOT, "app/(super)"), /^(actions|route)\.ts$/).filter((f) => !/requireSuperAdmin/.test(readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f))
    expect(bad).toEqual([])
  })

  it("pages under app/(super) reach data only through the guarded lib/super layer", () => {
    const bad = files(path.join(ROOT, "app/(super)"), /\.(ts|tsx)$/)
      .filter((f) => /@\/lib\/db|unscopedDb|scopedDb/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f))
    expect(bad).toEqual([])
  })

  it("the auth callbacks never take identity from the client (no session-update merge into the token)", () => {
    const s = readFileSync(path.join(ROOT, "lib/auth/index.ts"), "utf8")
    expect(s).not.toMatch(/trigger\s*===\s*["']update["']/)
    expect(s).not.toMatch(/jwt\(\{[^)]*session/)
  })
})
