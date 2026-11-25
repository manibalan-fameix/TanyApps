import { beforeAll, describe, expect, it } from "vitest"

import { openRow, phoneLookupHash, sealValues } from "@/lib/db/sealed"
import { orderPhoneHash, orderPhoneKey } from "@/lib/restaurant/order-phone"

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
  process.env.BLIND_INDEX_KEY = Buffer.alloc(32, 9).toString("base64")
})

const order = { customerName: "Ravi Kumar", customerPhone: "98765 43210", address: "12 Gandhi Road", note: "", pincode: "600040", total: 250 }

describe("sealed guest details", () => {
  it("seals the guest's details and nothing else", () => {
    const s = sealValues("orders", order, "r1")
    for (const k of ["customerName", "customerPhone", "address"] as const) expect(s[k]).toMatch(/^v2:/)
    expect(s.note).toBe("") // empty stays empty
    expect(s.pincode).toBe("600040")
    expect(s.total).toBe(250)
    expect(JSON.stringify(s)).not.toContain("Ravi")
    expect(JSON.stringify(s)).not.toContain("98765")
  })
  it("adds the lookup hash for an order's phone", () => {
    expect((sealValues("orders", order, "r1") as typeof order & { customerPhoneHash: string }).customerPhoneHash).toBe(phoneLookupHash("98765 43210"))
  })
  it("opens again under the same restaurant", () => {
    expect(openRow("orders", sealValues("orders", order, "r1"), "r1")).toMatchObject({ customerName: "Ravi Kumar", customerPhone: "98765 43210", address: "12 Gandhi Road" })
  })
  it("will not open under another restaurant", () => {
    const o = openRow("orders", sealValues("orders", order, "r1"), "r2")
    expect(o.customerName).toBe("")
    expect(o.customerPhone).toBe("")
  })
  it("does not seal twice, and returns not-yet-sealed rows as they are", () => {
    const once = sealValues("orders", order, "r1")
    expect(sealValues("orders", once, "r1").customerName).toBe(once.customerName)
    expect(openRow("orders", order, "r1")).toEqual(order)
  })
  it("seals enquiries and table requests, and leaves other tables alone", () => {
    expect(sealValues("enquiries", { name: "A", phone: "9", message: "hi", status: "new" }, "r1")).toMatchObject({ status: "new", name: expect.stringMatching(/^v2:/), message: expect.stringMatching(/^v2:/) })
    expect(sealValues("tableBookings", { name: "A", phone: "9", guests: 2 }, "r1").guests).toBe(2)
    expect(sealValues("menuItems", { name: "Dosa" }, "r1")).toEqual({ name: "Dosa" })
  })
  it("hashes every spelling of a number the same, and different numbers differently", () => {
    expect(orderPhoneHash("98765 43210")).toBe(orderPhoneHash("+91-9876543210"))
    expect(orderPhoneHash("9876543210")).not.toBe(orderPhoneHash("9876543211"))
  })
  it("groups by hash when there is one, by the plain number when there is not", () => {
    expect(orderPhoneKey({ customerPhone: "x", customerPhoneHash: "h" })).toBe("h")
    expect(orderPhoneKey({ customerPhone: "+91900", customerPhoneHash: null })).toBe("+91900")
  })
})
