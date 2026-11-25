import { afterEach, describe, expect, it, vi } from "vitest"

import { accuratePosition, type PositionSource } from "../lib/core/geo/accurate-position"
import { pinAgreement } from "../lib/core/geo/pin-check"
import { checkoutSchema } from "../lib/restaurant/orders"
import { addressLine, decodeAddress, encodeAddress, matchingAddress, savedAddressSchema } from "../lib/restaurant/saved-address"

/** A stand-in phone: the test sends readings and errors to whoever is watching. */
function phone() {
  let ok: PositionCallback = () => {}
  let bad: PositionErrorCallback = () => {}
  const clearWatch = vi.fn()
  const source: PositionSource = {
    watchPosition: (success, error) => {
      ok = success
      bad = error!
      return 7
    },
    clearWatch,
  }
  return {
    source,
    clearWatch,
    read: (accuracy: number, latitude = 13) => ok({ coords: { latitude, longitude: 80, accuracy } } as GeolocationPosition),
    fail: (code: number) => bad({ code } as GeolocationPositionError),
  }
}

describe("accuratePosition", () => {
  afterEach(() => vi.useRealTimers())

  it("stops at the first reading that is accurate enough", async () => {
    const p = phone()
    const result = accuratePosition(p.source, { targetM: 20 })
    p.read(500, 13.1)
    p.read(12, 13.2)
    await expect(result).resolves.toEqual({ lat: 13.2, lng: 80, accuracy: 12 })
    expect(p.clearWatch).toHaveBeenCalledWith(7)
  })

  it("keeps the best reading when time runs out, even if a later one is worse", async () => {
    vi.useFakeTimers()
    const p = phone()
    const result = accuratePosition(p.source, { maxWaitMs: 1000 })
    p.read(300, 13.1)
    p.read(60, 13.2)
    p.read(900, 13.3)
    vi.advanceTimersByTime(1000)
    await expect(result).resolves.toEqual({ lat: 13.2, lng: 80, accuracy: 60 })
  })

  it("rejects at once when location is blocked", async () => {
    const p = phone()
    const result = accuratePosition(p.source)
    p.fail(1)
    await expect(result).rejects.toEqual({ code: 1 })
  })

  it("waits through a passing error, and times out when nothing ever arrives", async () => {
    vi.useFakeTimers()
    const p = phone()
    const result = accuratePosition(p.source, { maxWaitMs: 1000 })
    p.fail(2)
    vi.advanceTimersByTime(1000)
    await expect(result).rejects.toEqual({ code: 3 })
  })
})

describe("pinAgreement", () => {
  const pin = { lat: 13.0418, lng: 80.2341 }
  it("accepts the same pincode", () => expect(pinAgreement("600017", null, pin, "600017")).toBe("match"))
  it("accepts a neighbouring or missing pincode when the pin is near the typed one", () => {
    expect(pinAgreement("600033", { lat: 13.05, lng: 80.24 }, pin, "600017")).toBe("match")
    expect(pinAgreement(null, { lat: 13.05, lng: 80.24 }, pin, "600017")).toBe("match")
  })
  it("rejects a pin far from the typed pincode", () => {
    expect(pinAgreement("600033", { lat: 12.9, lng: 80.1 }, pin, "603001")).toBe("mismatch")
    expect(pinAgreement("600033", null, pin, "603001")).toBe("mismatch")
  })
  it("says unknown when the map service cannot tell", () => expect(pinAgreement(null, null, pin, "600017")).toBe("unknown"))
})

describe("saved addresses", () => {
  const input = { label: "Home", house: "12A", street: "Lake View Road, T Nagar, Chennai", landmark: "SBI ATM", pincode: "600017", lat: 13.0418, lng: 80.2341 }

  it("needs a pin in India", () => {
    expect(savedAddressSchema.safeParse(input).success).toBe(true)
    expect(savedAddressSchema.safeParse({ ...input, lat: undefined }).success).toBe(false)
    expect(savedAddressSchema.safeParse({ ...input, lat: 51.5, lng: -0.12 }).success).toBe(false)
  })

  it("survives being stored and read back", () => {
    const a = savedAddressSchema.parse(input)
    expect(decodeAddress({ id: "x", label: "Home", lat: a.lat, lng: a.lng }, encodeAddress(a))).toEqual({ ...a, id: "x", line: "12A, Lake View Road, T Nagar, Chennai, near SBI ATM" })
  })

  it("ignores damaged rows and rows without a pin", () => {
    expect(decodeAddress({ id: "x", label: "Home", lat: null, lng: null }, encodeAddress(savedAddressSchema.parse(input)))).toBeNull()
    expect(decodeAddress({ id: "x", label: "Home", lat: 13, lng: 80 }, '{"name":"a cab place"}')).toBeNull()
    expect(decodeAddress({ id: "x", label: "Home", lat: 13, lng: 80 }, "nonsense")).toBeNull()
  })

  it("finds the saved address a monthly plan uses, only when line and pincode both match", () => {
    const a = savedAddressSchema.parse(input)
    const saved = decodeAddress({ id: "x", label: "Home", lat: a.lat, lng: a.lng }, encodeAddress(a))!
    expect(matchingAddress([saved], { address: saved.line, pincode: "600017" })?.id).toBe("x")
    expect(matchingAddress([saved], { address: saved.line, pincode: "600018" })).toBeNull()
    expect(matchingAddress([saved], { address: "12 Main Road, Chennai", pincode: "600017" })).toBeNull()
  })

  it("always fits the address an order accepts, even at every field's limit", () => {
    const longest = addressLine({ house: "h".repeat(60), street: "s".repeat(150), landmark: "l".repeat(70) })
    expect(checkoutSchema.shape.address.safeParse(longest).success).toBe(true)
  })
})
