import { afterEach, describe, expect, it, vi } from "vitest"

import { MockRcProvider } from "../lib/rc/mock"
import { normalizeDate, normalizeFuel, normalizeOwnerCount } from "../lib/rc/normalize"
import { getRcProvider } from "../lib/rc/provider"
import { SurepassRcProvider } from "../lib/rc/surepass"
import { RcError } from "../lib/rc/types"

describe("normalisers", () => {
  it("fuel: petrol wins on dual-fuel, electric and hybrid are distinguished", () => {
    expect(normalizeFuel("PETROL/CNG")).toBe("Petrol")
    expect(normalizeFuel("CNG ONLY")).toBe("CNG")
    expect(normalizeFuel("DIESEL")).toBe("Diesel")
    expect(normalizeFuel("ELECTRIC(BOV)")).toBe("Electric")
    expect(normalizeFuel("PETROL/HYBRID")).toBe("Hybrid")
    expect(normalizeFuel("")).toBeNull()
    expect(normalizeFuel("STEAM")).toBeNull()
  })
  it("dates from the common RC formats", () => {
    expect(normalizeDate("2017-03-15")).toBe("2017-03-15")
    expect(normalizeDate("15-03-2017")).toBe("2017-03-15")
    expect(normalizeDate("15/03/2017")).toBe("2017-03-15")
    expect(normalizeDate("2017-03")).toBe("2017-03-01")
    expect(normalizeDate("NA")).toBeNull()
  })
  it("owner count", () => {
    expect(normalizeOwnerCount("1")).toBe(1)
    expect(normalizeOwnerCount("2nd")).toBe(2)
    expect(normalizeOwnerCount("THIRD")).toBe(3)
    expect(normalizeOwnerCount("")).toBeNull()
    expect(normalizeOwnerCount("0")).toBeNull()
  })
})

describe("mock provider", () => {
  const p = new MockRcProvider()
  it("is deterministic and never claims to be verified", async () => {
    const a = p.normalize(await p.fetch("TN11AB1234"), "TN11AB1234")
    const b = p.normalize(await p.fetch("tn 11 ab 1234"), "TN11AB1234")
    expect(a).toEqual(b)
    expect(p.verified).toBe(false)
    expect(a.makerRaw).not.toBe("")
    expect(a.manufacturingYear).toBeGreaterThan(2000)
  })
  it("simulates not-found and outage", async () => {
    await expect(p.fetch("TN11AB0000")).rejects.toMatchObject({ code: "not_found" })
    await expect(p.fetch("TN11AB9999")).rejects.toMatchObject({ code: "provider_error" })
  })
  it("never exposes personal fields", async () => {
    const raw = { ...(await p.fetch("TN11AB1234")) as object, owner_name: "A B", father_name: "C", present_address: "X", chassis_number: "CH1", engine_number: "EN1" }
    const json = JSON.stringify(p.normalize(raw, "TN11AB1234"))
    for (const secret of ["A B", "present_address", "CH1", "EN1"]) expect(json).not.toContain(secret)
  })
})

describe("provider selection", () => {
  it("defaults to the mock and rejects unknown names", () => {
    expect(getRcProvider({}).name).toBe("mock")
    expect(() => getRcProvider({ RC_PROVIDER: "nope" })).toThrow(/Unknown RC_PROVIDER/)
  })
  it("real provider requires a key", () => {
    expect(() => getRcProvider({ RC_PROVIDER: "surepass" })).toThrow(/RC_API_KEY/)
    expect(getRcProvider({ RC_PROVIDER: "surepass", RC_API_KEY: "k" }).verified).toBe(true)
  })
})

describe("surepass adapter (network mocked)", () => {
  afterEach(() => vi.unstubAllGlobals())
  const provider = new SurepassRcProvider({ apiKey: "secret-key" })
  const respond = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })))

  it("sends the key as a bearer token and the plate in the body", async () => {
    respond(200, { success: true, data: { rc_number: "TN11AB1234" } })
    await provider.fetch("tn 11 ab 1234")
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toContain("/rc/rc-full")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret-key" })
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ id_number: "TN11AB1234" })
  })
  it("maps errors to RcError codes", async () => {
    for (const [status, code] of [[401, "unauthorized"], [404, "not_found"], [429, "rate_limited"], [500, "provider_error"]] as const) {
      respond(status, {})
      await expect(provider.fetch("TN11AB1234")).rejects.toMatchObject({ code })
    }
    respond(200, { success: false })
    await expect(provider.fetch("TN11AB1234")).rejects.toBeInstanceOf(RcError)
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down") }))
    await expect(provider.fetch("TN11AB1234")).rejects.toMatchObject({ code: "provider_error" })
  })
  it("normalises a typical response and drops personal fields", () => {
    const rec = provider.normalize({
      maker_description: "MARUTI SUZUKI INDIA LTD", maker_model: "BALENO DDIS ALPHA", fuel_type: "DIESEL",
      registration_date: "2017-04-12", manufacturing_date_formatted: "2017-03", owner_number: "2",
      insurance_upto: "2027-03-31", financed: true, color: "WHITE", vehicle_category_description: "LMV",
      seat_capacity: "5", owner_name: "SECRET NAME", present_address: "SECRET ADDRESS", vehicle_chasi_number: "SECRETCHASSIS",
    }, "TN11AB1234")
    expect(rec).toMatchObject({ fuel: "Diesel", manufacturingYear: 2017, ownerCount: 2, hypothecated: true, insuranceValidTill: "2027-03-31", seatingCapacity: 5 })
    expect(JSON.stringify(rec)).not.toMatch(/SECRET/)
  })
  it("infers hypothecation from a financier when the flag is absent", () => {
    expect(provider.normalize({ financer: "HDFC BANK" }, "TN11AB1234").hypothecated).toBe(true)
    expect(provider.normalize({}, "TN11AB1234").hypothecated).toBeNull()
  })
})
