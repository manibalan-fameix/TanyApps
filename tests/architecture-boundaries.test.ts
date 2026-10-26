// Product boundary check. TanyMotos (cars), TanyEats (restaurant) and TanyCabs (cabs) are modules of one app; none may import
// another's code. Shared code belongs in lib/core or components/ui, not inside a product folder.
//
// This is a ratchet: KNOWN_EDGES are the cross-product imports that existed when the check was added (shared pieces that were
// built inside one product first). The list may only shrink. When you move a shared piece out of its product folder, delete its
// line here; a test below fails if an entry is left behind. Adding a new edge fails the first test.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "..")
const PRODUCTS = ["cars", "restaurant", "cabs"] as const
type Product = (typeof PRODUCTS)[number]

const KNOWN_EDGES = new Set([
  "lib/cabs/admin-actions.ts -> restaurant",
  "components/cabs/fleet.tsx -> restaurant",
  "components/cabs/fleet.tsx -> cars",
  "components/cabs/drivers.tsx -> restaurant",
  "components/cabs/drivers.tsx -> cars",
  "components/cabs/dashboard.tsx -> restaurant",
  "components/cabs/tenant/backdrop-map.tsx -> restaurant",
  "components/restaurant/ops-grids.tsx -> cars",
  "components/restaurant/data-grid.tsx -> cars",
  "components/restaurant/restaurant-grids.tsx -> cars",
])

// lib/core is the shared platform. These are the places where it reaches into a product (the scheduled jobs are product-aware by
// nature; the geo files read cab trip states). Same rule: the list only shrinks.
const KNOWN_CORE_EDGES = new Set([
  "lib/core/geo/google.ts -> ../../cabs/states",
  "lib/core/geo/osm.ts -> ../../cabs/states",
  "lib/core/jobs/expire-trip-holds.ts -> ../../cabs/trips",
  "lib/core/jobs/expire-unpaid-orders.ts -> ../../restaurant/payments",
  "lib/core/jobs/retry-order-refunds.ts -> ../../restaurant/payments",
])

function walk(dir: string, out: string[] = []): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8")
  return [...text.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1])
}

/** Which product a specifier points into, if any: "@/lib/restaurant/x", "../restaurant/x" and "../../lib/restaurant/x" alike. */
function productOf(specifier: string): Product | null {
  const m = /^(?:@\/|(?:\.\.?\/)+)?(?:lib\/|components\/)?(cars|restaurant|cabs)(?:\/|$)/.exec(specifier)
  return m ? (m[1] as Product) : null
}

function edges(): string[] {
  const found: string[] = []
  for (const owner of PRODUCTS) {
    for (const base of ["lib", "components"]) {
      for (const file of walk(path.join(ROOT, base, owner))) {
        for (const spec of importsOf(file)) {
          const target = productOf(spec)
          if (target && target !== owner) found.push(`${path.relative(ROOT, file)} -> ${target}`)
        }
      }
    }
  }
  return [...new Set(found)].sort()
}

describe("product boundaries", () => {
  const actual = edges()

  it("adds no new cross-product import", () => {
    const fresh = actual.filter((e) => !KNOWN_EDGES.has(e))
    expect(fresh, "A product module imports another product. Move the shared piece to lib/core or components/ui instead.").toEqual([])
  })

  it("keeps the allowlist honest: every entry is still a real edge", () => {
    const stale = [...KNOWN_EDGES].filter((e) => !actual.includes(e))
    expect(stale, "These edges are gone. Delete them from KNOWN_EDGES so they cannot come back.").toEqual([])
  })

  it("adds no new product dependency to lib/core", () => {
    const found: string[] = []
    for (const file of walk(path.join(ROOT, "lib", "core"))) {
      for (const spec of importsOf(file)) {
        if (productOf(spec) || /(^|\/)(cars|restaurant|cabs)(\/|$)/.test(spec)) found.push(`${path.relative(ROOT, file)} -> ${spec}`)
      }
    }
    const unique = [...new Set(found)]
    expect(unique.filter((e) => !KNOWN_CORE_EDGES.has(e))).toEqual([])
    expect([...KNOWN_CORE_EDGES].filter((e) => !unique.includes(e)), "Delete resolved edges from KNOWN_CORE_EDGES.").toEqual([])
  })
})
