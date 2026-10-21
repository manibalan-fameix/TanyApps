import { describe, expect, it } from "vitest"

import { INDUSTRY_KEYS, allowedEmails, canCreateVertical, industriesFor } from "../../lib/verticals"

describe("the cabs allow-list", () => {
  const env = { CABS_ALLOWED_EMAILS: " Owner@Anna.in , second@anna.in,,", NODE_ENV: "production" }

  it("lets only listed, verified emails create a cab business, whatever their case or spacing", () => {
    expect(canCreateVertical("cabs", "owner@anna.in", env)).toBe(true)
    expect(canCreateVertical("cabs", "  OWNER@ANNA.IN ", env)).toBe(true)
    expect(canCreateVertical("cabs", "second@anna.in", env)).toBe(true)
    expect(canCreateVertical("cabs", "stranger@example.com", env)).toBe(false)
    expect(canCreateVertical("cabs", "owner@anna.in.evil.com", env)).toBe(false)
    expect(canCreateVertical("cabs", "xowner@anna.in", env)).toBe(false)
  })

  it("lets nobody in when the list is empty or unset, or when the person has no email", () => {
    expect(canCreateVertical("cabs", "owner@anna.in", { NODE_ENV: "production" })).toBe(false)
    expect(canCreateVertical("cabs", "owner@anna.in", { CABS_ALLOWED_EMAILS: "", NODE_ENV: "production" })).toBe(false)
    expect(canCreateVertical("cabs", "owner@anna.in", { CABS_ALLOWED_EMAILS: " , ", NODE_ENV: "production" })).toBe(false)
    expect(canCreateVertical("cabs", null, env)).toBe(false)
    expect(canCreateVertical("cabs", undefined, env)).toBe(false)
    expect(canCreateVertical("cabs", "", env)).toBe(false)
  })

  it("does not touch the other products", () => {
    for (const k of ["motors", "restaurants"] as const) {
      expect(canCreateVertical(k, null, { NODE_ENV: "production" })).toBe(true)
      expect(canCreateVertical(k, "anyone@example.com", env)).toBe(true)
      expect(allowedEmails(k, env).size).toBe(0)
    }
  })

  it("offers each person the industries they may create", () => {
    expect(industriesFor("stranger@example.com", INDUSTRY_KEYS, env)).toEqual(["motors", "restaurants"])
    expect(industriesFor("owner@anna.in", INDUSTRY_KEYS, env)).toEqual(["motors", "restaurants", "cabs"])
    expect(industriesFor(null, INDUSTRY_KEYS, env)).toEqual(["motors", "restaurants"])
  })

  it("adds the seeded owner and the dev user in development only", () => {
    const dev = { CABS_ALLOWED_EMAILS: "", SEED_OWNER_EMAIL: "Dev.Owner@Example.com", NODE_ENV: "development" }
    expect(canCreateVertical("cabs", "dev.owner@example.com", dev)).toBe(true)
    expect(canCreateVertical("cabs", "dev@localhost", dev)).toBe(true)
    expect(canCreateVertical("cabs", "dev@localhost", { ...dev, NODE_ENV: "production" })).toBe(false)
    expect(canCreateVertical("cabs", "dev.owner@example.com", { ...dev, NODE_ENV: "production" })).toBe(false)
  })
})
