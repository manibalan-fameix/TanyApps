import { describe, expect, it } from "vitest"

import { activePilot, parsePilots } from "../lib/billing/pilot"
import { billingState, effectivePlanKey } from "../lib/billing/state"
import { priceFor } from "../lib/plans"

const env = (v: string) => ({ PILOT_DEALERS: v })
const at = (iso: string) => new Date(iso)

describe("pilot setting", () => {
  it("reads slug:plan:last-day entries, ignoring spaces, case and empty parts", () => {
    const { pilots, ignored } = parsePilots(" Anna-Travels:PRO:2027-03-31 , other:growth:2027-01-15,,")
    expect(pilots.map((p) => `${p.slug}:${p.plan}`)).toEqual(["anna-travels:pro", "other:growth"])
    expect(ignored).toEqual([])
  })
  it("ignores, and reports, anything malformed instead of guessing", () => {
    const bad = ["noplan:2027-03-31", "x:free:2027-03-31", "x:platinum:2027-03-31", "x:pro:2027-02-30", "x:pro:31-03-2027", "x:pro:", ":pro:2027-03-31", "x:pro:2027-13-01", "UP PER:pro:2027-03-31"]
    const { pilots, ignored } = parsePilots(bad.join(","))
    expect(pilots).toEqual([])
    expect(ignored).toHaveLength(bad.length)
    expect(parsePilots(undefined)).toEqual({ pilots: [], ignored: [] })
    expect(parsePilots("")).toEqual({ pilots: [], ignored: [] })
  })
  it("is in force through the whole last day in India, and not a moment longer", () => {
    const e = env("anna:pro:2027-03-31")
    expect(activePilot("anna", at("2027-03-31T23:59:00+05:30"), e)?.plan).toBe("pro")
    expect(activePilot("anna", at("2027-04-01T00:00:00+05:30"), e)).toBeNull()
    expect(activePilot("anna", at("2026-01-01T00:00:00+05:30"), e)?.plan).toBe("pro")
  })
  it("names only the business it is for", () => {
    const e = env("anna:pro:2027-03-31")
    expect(activePilot("ANNA", at("2027-01-01T00:00:00Z"), e)).not.toBeNull()
    expect(activePilot("anna-travels", at("2027-01-01T00:00:00Z"), e)).toBeNull()
    expect(activePilot(null, at("2027-01-01T00:00:00Z"), e)).toBeNull()
    expect(activePilot("anna", at("2027-01-01T00:00:00Z"), {})).toBeNull()
  })
})

describe("a pilot in billing", () => {
  const dealer = { slug: "anna", plan: "starter", trialEndsAt: null, paidThrough: null, subscriptionStatus: null }
  const now = at("2027-02-01T10:00:00+05:30")
  const withPilot = (fn: () => void) => {
    const before = process.env.PILOT_DEALERS
    process.env.PILOT_DEALERS = "anna:pro:2027-03-31"
    try {
      fn()
    } finally {
      if (before === undefined) delete process.env.PILOT_DEALERS
      else process.env.PILOT_DEALERS = before
    }
  }

  it("gives full access with nothing to pay and the pilot plan's limits, even for a business whose trial is long over", () => {
    withPilot(() => {
      const s = billingState({ ...dealer, trialEndsAt: at("2026-01-01T00:00:00Z") }, now)
      expect(s).toMatchObject({ phase: "pilot", hasAccess: true, hasPaymentMethod: false, cancelling: false, paymentIssue: false })
      expect(s.accessUntil?.toISOString()).toBe("2027-03-31T18:29:59.999Z")
      expect(s.daysLeft).toBe(59) // 58.6 days, rounded up like every other "days left"
      expect(effectivePlanKey(dealer, now)).toBe("pro")
    })
  })
  it("ends by itself: afterwards the business is on its own plan and subscription again", () => {
    withPilot(() => {
      const after = at("2027-04-02T10:00:00+05:30")
      expect(effectivePlanKey(dealer, after)).toBe("starter")
      expect(billingState({ ...dealer, trialEndsAt: at("2027-01-01T00:00:00Z") }, after)).toMatchObject({ phase: "suspended", hasAccess: false })
    })
  })
  it("does not touch anyone else", () => {
    withPilot(() => {
      expect(effectivePlanKey({ ...dealer, slug: "someone-else" }, now)).toBe("starter")
      expect(billingState({ ...dealer, slug: "someone-else", trialEndsAt: at("2027-01-01T00:00:00Z") }, now).phase).toBe("suspended")
    })
  })
})

describe("cab prices", () => {
  it("are the owner's: 3,999 / 7,999 / 14,999 a month, yearly at ten months", () => {
    expect(priceFor("cabs", "starter", "monthly")).toBe(3_999)
    expect(priceFor("cabs", "growth", "monthly")).toBe(7_999)
    expect(priceFor("cabs", "pro", "monthly")).toBe(14_999)
    expect(priceFor("cabs", "starter", "yearly")).toBe(39_990)
    expect(priceFor("cabs", "pro", "yearly")).toBe(149_990)
  })
  it("leave cars and restaurants on the shared table, yearly at eleven months", () => {
    for (const industry of ["motors", "restaurants"]) {
      expect(priceFor(industry, "starter", "monthly")).toBe(2_999)
      expect(priceFor(industry, "growth", "monthly")).toBe(4_999)
      expect(priceFor(industry, "pro", "monthly")).toBe(8_999)
      expect(priceFor(industry, "pro", "yearly")).toBe(98_989)
    }
  })
})
