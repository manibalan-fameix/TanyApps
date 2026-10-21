import { beforeEach, describe, expect, it, vi } from "vitest"

const dealers = new Map<string, unknown>()
vi.mock("../lib/tenant/dealer", () => ({ getDealerBySlug: async (slug: string) => dealers.get(slug) ?? null }))
vi.mock("../lib/auth/context", () => ({ getDealerContext: async () => ({ status: "anonymous" }) }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`) } }))

import { assertSameTenant, clientIp, requireIndustry, tenantFrom } from "../lib/core/guards"

const h = (init: Record<string, string>) => new Headers(init)
const dealer = (industry: string, suspended = false) => ({ id: "d1", slug: "x", industry, suspended })

beforeEach(() => {
  dealers.clear()
})

describe("clientIp", () => {
  it("prefers the edge-set header over anything the client can forge", () => {
    expect(clientIp(h({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "6.6.6.6", "x-real-ip": "5.5.5.5" }))).toBe("1.1.1.1")
    expect(clientIp(h({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "6.6.6.6" }))).toBe("5.5.5.5")
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7" }))).toBe("6.6.6.6")
    expect(clientIp(h({}))).toBe("unknown")
  })
})

describe("tenantFrom", () => {
  it("returns the tenant when the host's business runs that industry and is open", async () => {
    dealers.set("anna", dealer("restaurants"))
    const ctx = await tenantFrom(h({ "x-tenant-slug": "anna", "cf-connecting-ip": "2.2.2.2" }), "restaurants")
    expect(ctx?.dealer.id).toBe("d1")
    expect(ctx?.ip).toBe("2.2.2.2")
  })

  it("is null with no tenant header, an unknown slug, another industry or a suspended business", async () => {
    dealers.set("anna", dealer("restaurants"))
    dealers.set("motors", dealer("motors"))
    dealers.set("late", dealer("restaurants", true))
    expect(await tenantFrom(h({}), "restaurants")).toBeNull()
    expect(await tenantFrom(h({ "x-tenant-slug": "nobody" }), "restaurants")).toBeNull()
    expect(await tenantFrom(h({ "x-tenant-slug": "motors" }), "restaurants")).toBeNull()
    expect(await tenantFrom(h({ "x-tenant-slug": "anna" }), "cabs")).toBeNull()
    expect(await tenantFrom(h({ "x-tenant-slug": "late" }), "restaurants")).toBeNull()
  })
})

describe("requireIndustry", () => {
  it("sends a signed-out visitor to the login page", async () => {
    await expect(requireIndustry("restaurants")).rejects.toThrow("redirect:/login")
  })
})

describe("assertSameTenant", () => {
  it("passes for the same dealer and throws for another", () => {
    expect(() => assertSameTenant("a", "a")).not.toThrow()
    expect(() => assertSameTenant("a", "b")).toThrow("tenant mismatch")
  })
})
