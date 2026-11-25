import { describe, expect, it } from "vitest"

import { extractInvoice, rowsFromInvoice } from "@/lib/ai/invoice-extract"
import type { VisionClient } from "@/lib/ai/vision"
import {
  autoMap,
  findHeaderRow,
  mergeDuplicates,
  parseCsv,
  planImport,
  resolvePrice,
  rowsFromTable,
  templateCsv,
  toNumber,
  validateRows,
  type ImportRow,
  NO_DETAILS,
} from "@/lib/restaurant/bulk-import"

const row = (o: Partial<ImportRow> = {}): ImportRow => ({ ...NO_DETAILS, name: "Ponni Rice 5 kg", category: null, price: 349, mrp: null, cost: null, stock: null, unit: null, description: "", ...o })

describe("column auto-mapping", () => {
  it("recognises common ERP and Excel headers", () => {
    const map = autoMap(["S.No", "Item Name", "Item Group", "HSN", "Closing Stock", "Unit", "Selling Price", "MRP", "Purchase Rate"])
    expect(map).toMatchObject({ name: 1, category: 2, stock: 4, unit: 5, price: 6, mrp: 7, cost: 8 })
  })
  it("never lets a purchase price become the selling price", () => {
    const map = autoMap(["Product", "Purchase Price", "Qty"])
    expect(map.price).toBeUndefined()
    expect(map.cost).toBe(1)
  })
  it("uses a column for one field only", () => {
    const map = autoMap(["Name", "Rate"])
    expect(new Set(Object.values(map)).size).toBe(Object.values(map).length)
  })
  it("finds the header under a printed report title", () => {
    const sheet = [["ABC Traders"], ["Stock report 01-Apr to 30-Sep"], [], ["Item Name", "Qty", "Rate"], ["Rice", 5, 40]]
    expect(findHeaderRow(sheet)).toBe(3)
  })
})

describe("cleaning values", () => {
  it("reads rupee and quantity text", () => {
    expect(toNumber("₹1,250.50")).toBe(1250.5)
    expect(toNumber("Rs. 90")).toBe(90)
    expect(toNumber("12 pcs")).toBe(12)
    expect(toNumber("n/a")).toBeNull()
    expect(toNumber(7)).toBe(7)
  })
  it("turns sheet rows into import rows and drops blank lines", () => {
    const map = autoMap(["Item Name", "Category", "Price", "Qty"])
    const rows = rowsFromTable([["Ponni rice", "Grains", "₹349.4", "10"], ["", "", "", ""], ["Dal", "", "168", ""]], map)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: "Ponni rice", category: "Grains", price: 349, stock: 10 })
    expect(rows[1]).toMatchObject({ category: null, stock: null })
  })
})

describe("duplicates", () => {
  it("combines the same product and adds its quantities", () => {
    const { rows, merged } = mergeDuplicates([row({ stock: 5 }), row({ name: "ponni  rice 5 KG", stock: 7 }), row({ name: "Dal" })])
    expect(merged).toBe(1)
    expect(rows).toHaveLength(2)
    expect(rows[0].stock).toBe(12)
  })
})

describe("pricing and validation", () => {
  it("prices from selling price, then MRP, then cost plus markup", () => {
    expect(resolvePrice({ price: 10, mrp: 20, cost: 5 }, 20)).toBe(10)
    expect(resolvePrice({ price: null, mrp: 20, cost: 5 }, 20)).toBe(20)
    expect(resolvePrice({ price: null, mrp: null, cost: 100 }, 25)).toBe(125)
    expect(resolvePrice({ price: null, mrp: null, cost: null }, 25)).toBeNull()
  })
  it("flags rows with no price or a bad name, and keeps the rest", () => {
    const { clean, problems } = validateRows([row(), row({ name: "A" }), row({ name: "Soap", price: null })])
    expect(clean[0]?.price).toBe(349)
    expect(clean[1]).toBeNull()
    expect(clean[2]).toBeNull()
    expect(problems.map((p) => p.index)).toEqual([2, 1].sort((a, b) => a - b))
  })
  it("drops an MRP that is not above the price, so nothing shows a fake offer", () => {
    expect(validateRows([row({ mrp: 300 })]).clean[0]?.mrp).toBeNull()
    expect(validateRows([row({ mrp: 400 })]).clean[0]?.mrp).toBe(400)
  })
})

describe("planning an import", () => {
  const existing = [{ id: "1", name: "Ponni Rice 5 kg", stockQuantity: 10, categoryId: null }]
  const clean = validateRows([row({ stock: 4 }), row({ name: "Toor Dal 1 kg", price: 168 })]).clean.flatMap((c) => (c ? [c] : []))
  it("updates matches instead of duplicating them, adding stock for a purchase", () => {
    const plan = planImport(clean, existing, { mode: "add", updateExisting: true })
    expect(plan[0]).toMatchObject({ action: "update", newStock: 14 })
    expect(plan[1].action).toBe("create")
  })
  it("replaces stock for a stock count", () => {
    expect(planImport(clean, existing, { mode: "set", updateExisting: true })[0]).toMatchObject({ newStock: 4 })
  })
  it("keeps existing stock when the file has no quantity", () => {
    const noQty = validateRows([row()]).clean.flatMap((c) => (c ? [c] : []))
    expect(planImport(noQty, existing, { mode: "set", updateExisting: true })[0]).toMatchObject({ newStock: 10 })
  })
  it("skips matches when told not to update", () => {
    expect(planImport(clean, existing, { mode: "add", updateExisting: false }).map((p) => p.action)).toEqual(["skip", "create"])
  })
})

describe("csv", () => {
  it("reads quotes, commas inside quotes, semicolons and a BOM", () => {
    expect(parseCsv('﻿Name,Price\r\n"Rice, 5 kg","3,49"\r\n')).toEqual([["Name", "Price"], ["Rice, 5 kg", "3,49"]])
    expect(parseCsv("Name;Price\nRice;349")).toEqual([["Name", "Price"], ["Rice", "349"]])
  })
  it("round-trips the template", () => {
    const t = parseCsv(templateCsv([{ name: 'Rice, "Ponni"', category: "Grains", price: "₹349" }]))
    expect(t[1][0]).toBe('Rice, "Ponni"')
    expect(t[1][2]).toBe("349")
    expect(autoMap(t[0]).name).toBe(0)
  })
})

describe("invoice reading", () => {
  const answer = { supplier: " Sri Traders ", invoiceNumber: "INV-9", invoiceDate: null, lines: [
    { name: "  Sunflower   Oil 1 L ", category: "Oils", quantity: 24, unit: "pcs", purchaseRate: 120.4, mrp: 150, sellingPrice: null, description: null },
    { name: "X", category: null, quantity: 1, unit: null, purchaseRate: 1, mrp: null, sellingPrice: null, description: null },
    { name: "Tea 250 g", category: null, quantity: -3, unit: null, purchaseRate: null, mrp: 0, sellingPrice: null, description: null },
  ] }
  it("turns lines into rows, dropping unusable names and bad numbers", () => {
    const rows = rowsFromInvoice(answer)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: "Sunflower Oil 1 L", category: "Oils", stock: 24, cost: 120, mrp: 150, price: null })
    expect(rows[1]).toMatchObject({ stock: null, mrp: null, cost: null })
  })
  it("returns the model's answer through the vision client, or null when it cannot read", async () => {
    const ok: VisionClient = { json: async () => answer as never }
    const res = await extractInvoice(ok, { documents: [{ mediaType: "application/pdf", base64: "x" }] })
    expect(res?.supplier).toBe("Sri Traders")
    expect(res?.rows).toHaveLength(2)
    const none: VisionClient = { json: async () => null }
    expect(await extractInvoice(none, { images: [] })).toBeNull()
  })
})
