import { describe, expect, it } from "vitest"

import { INDUSTRY_KEYS, allowedEmails, canCreateVertical, industriesFor } from "../../lib/verticals"

describe("live cabs availability", () => {
  const env = { CABS_ALLOWED_EMAILS: " Owner@Anna.in , second@anna.in,,", NODE_ENV: "production" }

  it("lets every signed-in operator create a cab business", () => {
    expect(canCreateVertical("cabs", "owner@anna.in", env)).toBe(true)
    expect(canCreateVertical("cabs", "  OWNER@ANNA.IN ", env)).toBe(true)
    expect(canCreateVertical("cabs", "second@anna.in", env)).toBe(true)
    expect(canCreateVertical("cabs", "stranger@example.com", env)).toBe(true)
    expect(canCreateVertical("cabs", "owner@anna.in.evil.com", env)).toBe(true)
    expect(canCreateVertical("cabs", "xowner@anna.in", env)).toBe(true)
  })

  it("does not require an email allow-list", () => {
    expect(canCreateVertical("cabs", "owner@anna.in", { NODE_ENV: "production" })).toBe(true)
    expect(canCreateVertical("cabs", null, env)).toBe(true)
    expect(canCreateVertical("cabs", undefined, env)).toBe(true)
    expect(canCreateVertical("cabs", "", env)).toBe(true)
  })

  it("does not touch the other products", () => {
    for (const k of ["motors", "restaurants"] as const) {
      expect(canCreateVertical(k, null, { NODE_ENV: "production" })).toBe(true)
      expect(canCreateVertical(k, "anyone@example.com", env)).toBe(true)
      expect(allowedEmails(k, env).size).toBe(0)
    }
  })

  it("offers each person the industries they may create", () => {
    expect(industriesFor("stranger@example.com", INDUSTRY_KEYS, env)).toEqual(["motors", "restaurants", "cabs"])
    expect(industriesFor(null, INDUSTRY_KEYS, env)).toEqual(["motors", "restaurants", "cabs"])
  })
})
