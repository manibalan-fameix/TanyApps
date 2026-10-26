// Identity ownership is enforced structurally, not just by behaviour: personal credentials and user rows have exactly one door each.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "..")
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}
const rel = (f: string) => path.relative(ROOT, f)
const app = ["app", "lib", "components", "hooks"].flatMap((d) => walk(path.join(ROOT, d))).filter((f) => !rel(f).startsWith("lib/db/schema"))
const text = (f: string) => readFileSync(f, "utf8")

describe("identity ownership", () => {
  it("nothing in the application can set a password: the only write to password_hash clears it", () => {
    const writers = app.filter((f) => /passwordHash\s*:(?!\s*null\b)/.test(text(f))).map(rel)
    expect(writers).toEqual([])
    const clears = app.filter((f) => /passwordHash\s*:\s*null/.test(text(f))).map(rel)
    expect(clears).toEqual(["lib/auth/firebase-user.ts"])
  })
  it("no application code hashes a password for storage", () => {
    const users = app.filter((f) => /\bhashPassword\b/.test(text(f))).map(rel).sort()
    // The helper itself, and an owner setting the PIN of their OWN delivery rider (a business-scoped credential, not a Tany user account).
    expect(users).toEqual(["lib/auth/password.ts", "lib/restaurant/admin-actions.ts"])
    const calls = [...text(path.join(ROOT, "lib/restaurant/admin-actions.ts")).matchAll(/(\w+):\s*await hashPassword\(/g)].map((m) => m[1])
    expect(calls).toEqual(["pinHash"])
  })
  it("user rows are created only by the Firebase sign-in path (and the development-only local login)", () => {
    const creators = app.filter((f) => /\.insert\(\s*users\s*\)/.test(text(f))).map(rel).sort()
    expect(creators).toEqual(["lib/auth/firebase-user.ts", "lib/auth/local-login.ts"])
  })
  it("a business owner's actions never import the account layer", () => {
    for (const f of ["app/(admin)/(shell)/settings/team/actions.ts", "lib/tenant/invites.ts"]) {
      const src = text(path.join(ROOT, f))
      expect(src, f).not.toMatch(/from ["'](@\/lib\/auth\/(password|firebase-user|teammate-login)|\.\.\/auth\/(password|firebase-user|teammate-login))["']/)
    }
  })
  it("invitation acceptance writes only the membership and the invitation, never the users or accounts tables", () => {
    const src = text(path.join(ROOT, "lib/tenant/invites.ts"))
    expect(src).not.toMatch(/\.(insert|update|delete)\(\s*(users|accounts)\b/)
  })
})
