import { describe, expect, it } from "vitest"

import { type EditableProduct, planProductEdit } from "@/lib/restaurant/grid-edit"

const item: EditableProduct = { name: "Sugar 1kg", description: "", categoryId: null, price: 46, compareAtPrice: 52, portions: [], imageUrl: null, isVeg: true, isAvailable: true, isFeatured: false, stockQuantity: 110, details: { brand: "Parry's", barcode: "8901" } }
const ok = (r: ReturnType<typeof planProductEdit>) => {
  if (!r.ok) throw new Error(r.error)
  return r
}
const error = (r: ReturnType<typeof planProductEdit>) => (r.ok ? null : r.error)

describe("editing a product cell by cell", () => {
  it("changes only what was edited", () => {
    const r = ok(planProductEdit(item, [{ field: "price", value: 48 }]))
    expect(r.values).toMatchObject({ name: "Sugar 1kg", price: 48, compareAtPrice: 52, isAvailable: true })
    expect(r.stock).toBeNull()
  })
  it("holds each cell to the product form's rules", () => {
    expect(error(planProductEdit(item, [{ field: "name", value: "" }]))).toBeTruthy()
    expect(error(planProductEdit(item, [{ field: "price", value: -1 }]))).toBeTruthy()
    expect(error(planProductEdit(item, [{ field: "price", value: null }]))).toBe("Enter a price.")
    expect(error(planProductEdit(item, [{ field: "status", value: "gone" }]))).toBeTruthy()
    expect(error(planProductEdit(item, [{ field: "categoryId", value: "not-an-id" }]))).toBeTruthy()
  })
  it("refuses an original price that is not higher, and ends the offer when the price catches up", () => {
    expect(error(planProductEdit(item, [{ field: "mrp", value: 40 }]))).toBe("The original price must be higher than the price.")
    expect(ok(planProductEdit(item, [{ field: "price", value: 60 }])).values.compareAtPrice).toBeNull()
  })
  it("will not overwrite the prices of a product sold in sizes", () => {
    expect(error(planProductEdit({ ...item, portions: [{ label: "500g", price: 25 }] }, [{ field: "price", value: 30 }]))).toContain("sizes")
  })
  it("keeps the old stock count with the new one, so a change made meanwhile is noticed", () => {
    expect(ok(planProductEdit(item, [{ field: "stock", previous: 110, value: 90 }])).stock).toEqual({ from: 110, to: 90 })
    expect(ok(planProductEdit(item, [{ field: "stock", previous: 110, value: null }])).stock).toEqual({ from: 110, to: null })
    expect(error(planProductEdit(item, [{ field: "stock", previous: 110, value: -5 }]))).toBeTruthy()
    expect(error(planProductEdit(item, [{ field: "stock", previous: 110, value: 1.5 }]))).toBeTruthy()
  })
  it("edits one product fact and keeps the others, removing one that is emptied", () => {
    expect(ok(planProductEdit(item, [{ field: "packSize", value: " 1 kg " }])).values.details).toEqual({ brand: "Parry's", barcode: "8901", packSize: "1 kg" })
    expect(ok(planProductEdit(item, [{ field: "brand", value: "" }])).values.details).toEqual({ barcode: "8901" })
    expect(ok(planProductEdit(item, [{ field: "gst", value: 5 }])).values.details.gst).toBe(5)
    expect(ok(planProductEdit(item, [{ field: "description", value: "Fine sugar" }])).values.description).toBe("Fine sugar")
  })
  it("holds product facts to the import's limits", () => {
    expect(error(planProductEdit(item, [{ field: "hsn", value: "1".repeat(17) }]))).toBe("HSN code can be at most 16 characters.")
    expect(error(planProductEdit(item, [{ field: "gst", value: 101 }]))).toBeTruthy()
    expect(error(planProductEdit(item, [{ field: "description", value: "x".repeat(401) }]))).toBeTruthy()
  })
})
