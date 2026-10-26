// Tenant access modes, enforced. Every file that may use the raw database client is listed here with the access mode that justifies it,
// and every route handler and server action must show its authorization or be listed as intentionally public. Adding a file or an
// entry point fails these tests until it is reviewed and added with a reason: this is the guard against future accidental
// cross-tenant access, alongside the scoped repositories (tests/tenant-leak*.test.ts) and ESLint's ban on the raw client in app/.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = path.resolve(__dirname, "..")
function walk(dir: string, re: RegExp, out: string[] = []): string[] {
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, re, out)
    else if (re.test(name)) out.push(full)
  }
  return out
}
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/")
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8")

/**
 * The four access modes of the platform:
 *  tenant   : one business, through scopedDb(dealerId) only. Needs no entry here because it never uses the raw client.
 *  public   : an anonymous visitor, resolved to a business from the host, then scopedDb.
 *  platform : the Tany team (lib/super), behind requireSuperAdmin() in every function.
 *  system   : trusted background work and webhooks that must find a tenant first (by a provider id, or by sweeping), then act through scopedDb/scopedTransaction.
 * The raw client (unscopedDb) is allowed only for the reasons below.
 */
type Mode = "identity" | "tenant-root" | "provider-lookup" | "system-sweep" | "platform-admin" | "global-data" | "audit-trail" | "usage-accounting" | "infrastructure"
const RAW_CLIENT_USERS: Record<string, Mode> = {
  // identity: users, accounts and memberships (global tables that define who a person is)
  "lib/auth/actions.ts": "identity",
  "lib/auth/context.ts": "identity",
  "lib/auth/firebase-user.ts": "identity",
  "lib/auth/index.ts": "identity",
  "lib/auth/local-login.ts": "identity",
  "lib/auth/teammate-login.ts": "identity",
  // tenant root: the dealers row itself and per-business settings that live on it (no dealer_id column to scope by)
  "lib/tenant/billing.ts": "tenant-root",
  "lib/tenant/create-dealer.ts": "tenant-root",
  "lib/tenant/dealer.ts": "tenant-root",
  "lib/tenant/invites.ts": "tenant-root", // finds an invitation by its secret token before the business is known; every write after is scoped
  "lib/tenant/lists.ts": "tenant-root",
  "lib/tenant/lookup.ts": "tenant-root",
  "lib/tenant/route.ts": "tenant-root",
  "lib/tenant/settings.ts": "tenant-root",
  "lib/tenant/team.ts": "tenant-root",
  "lib/tenant/user-phone.ts": "tenant-root",
  "lib/core/jobs/reconcile-subscriptions.ts": "tenant-root", // reads only the dealers rows that carry a subscription; every write goes through applySubscription
  "lib/restaurant/admin-actions.ts": "tenant-root", // writes only the signed-in business's own dealers row, id from the session
  "lib/cars/publish.ts": "tenant-root", // reads the business's plan row and opens the publish transaction
  // provider lookup: a Razorpay order/payment id identifies the row, then the tenant is known and all later work is scoped
  "lib/bookings/service.ts": "provider-lookup",
  "lib/restaurant/payments.ts": "provider-lookup",
  // system sweeps: scheduled jobs and the run-once lock
  "lib/core/jobs/expire-trip-holds.ts": "system-sweep",
  "lib/core/jobs/retry-booking-refunds.ts": "system-sweep",
  "lib/core/scheduler.ts": "system-sweep",
  "lib/jobs/requeue.ts": "system-sweep",
  // platform administration (Tany team): every exported function calls requireSuperAdmin() (enforced in super-admin-guard.test.ts)
  "lib/super/data.ts": "platform-admin",
  "lib/super/queries.ts": "platform-admin",
  "lib/super/usage.ts": "platform-admin",
  // shared reference data and operational tables that belong to no business
  "lib/core/geo/route-cache.ts": "global-data",
  "lib/core/payment-exceptions.ts": "global-data",
  "lib/variants/repo.ts": "global-data",
  "lib/cars/state.ts": "global-data", // reads the shared variants catalogue
  // the append-only platform security trail: insert-only, writes events for any business
  "lib/core/security-audit.ts": "audit-trail",
  // cost accounting: insert-and-increment only, keyed by business; read in aggregate by the Tany team
  "lib/core/usage.ts": "usage-accounting",
  // infrastructure
  "lib/db/client.ts": "infrastructure",
  "lib/db/scoped.ts": "infrastructure",
}
const ALLOWED_SCRIPTS = new Set(["scripts/seed-restaurant.ts", "scripts/seed.ts", "scripts/seed-staging.ts", "scripts/test-db.ts", "scripts/import-variants.ts"])

describe("raw database client access", () => {
  const importers = (dirs: string[]) =>
    dirs
      .flatMap((d) => walk(path.join(ROOT, d), /\.(ts|tsx|mjs)$/))
      .map(rel)
      .filter((f) => /db\/client|unscopedDb/.test(read(f)))
      .sort()

  it("is used by exactly the reviewed files in lib/, each with a stated access mode", () => {
    expect(importers(["lib"])).toEqual(Object.keys(RAW_CLIENT_USERS).sort())
  })
  it("is never imported by pages, components, hooks, the proxy or the Workers", () => {
    expect(importers(["app", "components", "hooks", "workers"])).toEqual([])
    expect(read("proxy.ts")).not.toMatch(/db\/client|unscopedDb/)
  })
  it("is used by scripts only for seeding and test setup", () => {
    const scripts = importers(["scripts"]).filter((f) => !ALLOWED_SCRIPTS.has(f))
    expect(scripts).toEqual([])
  })
  it("platform administration functions are the only broad reads of tenant tables, and are guarded (see super-admin-guard.test.ts)", () => {
    for (const f of ["lib/super/data.ts", "lib/super/queries.ts"]) expect(read(f)).toContain("requireSuperAdmin")
    expect(read("lib/super/usage.ts")).toMatch(/requireSuperAdmin|superAdminActor/)
  })
})

describe("scheduled and webhook code resolves a tenant before acting", () => {
  it("system and provider-lookup files act on tenant data through scopedDb or scopedTransaction", () => {
    for (const [f, mode] of Object.entries(RAW_CLIENT_USERS)) {
      if (mode !== "system-sweep" && mode !== "provider-lookup") continue
      if (f === "lib/core/scheduler.ts" || f === "lib/jobs/requeue.ts") continue // lock table and media rows by id, no tenant payload
      expect(read(f), f).toMatch(/scopedDb|scopedTransaction/)
    }
  })
})

// ---------- entry points ----------

/** Anything that proves who is calling, or which business a request is for, or that the caller is trusted infrastructure. */
const GUARD = /(getDealerContext|industrySession|requireIndustry|tenantContext|tenantFrom|requireSuperAdmin|superAdminActor|currentCustomer|customerFromToken|readRiderSession|currentRider|\bauth\(\)|secretsMatch|verifyWebhookSignature|verifyTicket|signTicket|resolveLoginHost|\bowner\(\)|ownerDealerId|\bopen\(|\bdealer\(\)|\brestaurant\(\)|\bwho\(\)|\bcars?\(\)|\bsession\(\)|\bctx\(\)|getBusiness|requireOwner|prepare\(|prepareManual\()/

describe("route handlers", () => {
  /** Route handlers that are intentionally reachable without a session, with the control that bounds them. */
  const PUBLIC_ROUTES: Record<string, string> = {
    "app/api/auth/[...nextauth]/route.ts": "Auth.js endpoints; sign-in itself",
    "app/api/t/auth/start/route.ts": "customer login start; state and host bound",
    "app/api/t/auth/callback/route.ts": "customer login callback; single-use signed ticket",
    "app/api/t/auth/session/route.ts": "reports the caller's own business-bound session",
    "app/api/t/auth/logout/route.ts": "ends the caller's own session",
    "app/api/t/media/[...key]/route.ts": "local-disk media in development only (404 when R2 is configured)",
    "app/api/t/track/route.ts": "public view counter; tenant from host, rate limited",
    "app/api/t/csp-report/route.ts": "receives browser CSP reports; size-capped, rate limited, logs origins only",
    "app/api/t/chat/route.ts": "public storefront chat; tenant from host, per-IP and per-business limits",
    "app/api/id/social/route.ts": "central login step; same-origin, rate limited",
    "app/api/id/ticket/route.ts": "central login step; same-origin, rate limited, verified OTP proof",
    "app/api/dev-storage/[...key]/route.ts": "development only (404 when R2 is configured)",
    "app/(tenant)/sites/[dealer]/pwa-manifest/route.ts": "public home-screen manifest of a cab operator's site: business name and brand colour only",
  }
  const routes = walk(path.join(ROOT, "app"), /^route\.ts$/).map(rel).sort()

  it("every route handler shows an authorization control or is listed as intentionally public", () => {
    const unexplained = routes.filter((f) => !GUARD.test(read(f)) && !(f in PUBLIC_ROUTES))
    expect(unexplained).toEqual([])
  })
  it("the public list contains only routes that exist (no stale exceptions)", () => {
    expect(Object.keys(PUBLIC_ROUTES).filter((f) => !routes.includes(f))).toEqual([])
  })
  it("public routes that are not tenant-resolving do not touch tenant data directly", () => {
    for (const f of Object.keys(PUBLIC_ROUTES)) expect(read(f), f).not.toMatch(/unscopedDb|db\/client/)
  })
})

describe("server actions", () => {
  /** Exported actions that are intentionally callable by anyone, with the reason. */
  const PUBLIC_ACTIONS = new Set([
    // sign-in and sign-out (they establish identity; each verifies its own proof)
    "firebaseAccountExists", "signInWithFirebaseToken", "signInTeammate", "openDevDemo", "signInWithEmailPassword", "signInSuperAdmin", "signInSuperAdminLocal",
    // anonymous storefront actions: the business comes from the host, input is validated, and each is rate limited
    "previewCoupon", "previewDelivery", "placeOrder", "confirmOrderPayment", "getPaymentCheckout", "cancelPendingOrder", "sendEnquiry", "submitReview",
    "locateGuest", "searchGuestPlaces", "checkPincode", "createBooking", "confirmBooking",
    "searchPlacesPublic", "placeDetailsPublic", "quickPickPublic", "getQuotes", "requestBooking", "cancelMyBooking",
    "updateProfile", "saveAddress", "deleteAddress", "saveContact", "deleteContact",
    // delivery rider sign-in by private PIN/link
    "riderSignIn", "riderSignOut", "riderUpdate", "riderOrders",
  ])
  const files = [...walk(path.join(ROOT, "app"), /\.(ts|tsx)$/), ...walk(path.join(ROOT, "lib"), /\.ts$/)].map(rel).filter((f) => /^"use server"/m.test(read(f)))

  it("every exported server action authorizes its caller or is on the reviewed public list", () => {
    const bad: string[] = []
    for (const f of files) {
      const src = read(f)
      for (const m of src.matchAll(/export async function (\w+)\s*\(/g)) {
        const body = src.slice(m.index!, m.index! + 900)
        if (!GUARD.test(body) && !PUBLIC_ACTIONS.has(m[1])) bad.push(`${f}:${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })
  it("the public action list names only actions that exist", () => {
    const names = new Set(files.flatMap((f) => [...read(f).matchAll(/export async function (\w+)\s*\(/g)].map((m) => m[1])))
    expect([...PUBLIC_ACTIONS].filter((a) => !names.has(a))).toEqual([])
  })
  it("anonymous storefront actions resolve the business from the host, never from their arguments", () => {
    for (const f of ["app/(tenant)/sites/[dealer]/actions.ts", "lib/cabs/public-actions.ts", "app/(tenant)/sites/[dealer]/[carSlug]/actions.ts"]) {
      expect(read(f), f).toMatch(/tenantContext|tenantFrom|getDealerBySlug|TENANT_HEADER/)
      expect(read(f), f).not.toMatch(/dealerId:\s*z\./) // no schema accepts a business id from the client
    }
  })
})
