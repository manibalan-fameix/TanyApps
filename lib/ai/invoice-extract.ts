import { z } from "zod"

import { NO_DETAILS, type ImportRow } from "../restaurant/bulk-import.ts"
import type { VisionClient, VisionDocument, VisionImage } from "./vision.ts"

/**
 * Reads a purchase invoice, a delivery challan or an ERP stock/price report (a photo or a PDF) into product rows.
 * The model only transcribes what is printed; it is told never to invent a price or quantity. Everything it returns is validated here and
 * again by the review screen and the server, and the owner confirms every row before anything is saved.
 */

const num = z.number().nullable()
const str = z.string().nullable()

const answer = z.object({
  supplier: str,
  invoiceNumber: str,
  invoiceDate: str,
  lines: z
    .array(
      z.object({
        name: z.string(),
        category: str,
        quantity: num,
        unit: str,
        /** What the shop paid per unit, before tax. */
        purchaseRate: num,
        /** The printed maximum retail price per unit, if any. */
        mrp: num,
        /** A selling price per unit, only if the document itself states one (a price list or ERP report). */
        sellingPrice: num,
        description: str,
      }),
    )
    .max(400),
})
export type InvoiceAnswer = z.infer<typeof answer>

const n = { type: ["number", "null"] }
const s = { type: ["string", "null"] }
const SCHEMA = {
  type: "object",
  properties: {
    supplier: s,
    invoiceNumber: s,
    invoiceDate: s,
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, category: s, quantity: n, unit: s, purchaseRate: n, mrp: n, sellingPrice: n, description: s },
        required: ["name", "category", "quantity", "unit", "purchaseRate", "mrp", "sellingPrice", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["supplier", "invoiceNumber", "invoiceDate", "lines"],
  additionalProperties: false,
}

const SYSTEM = `You read purchase invoices, delivery notes and stock or price reports for Indian shops (grocery, supermarket, textile, hardware, electronics, stationery and similar) and copy the product lines into structured data.
Rules:
- One entry per product line. Skip totals, tax summaries, freight, discounts, round-off, headers, bank details and signatures.
- Copy the product name as printed, in Title Case, without HSN codes, batch numbers or item codes. Keep the size or pack in the name when it is part of the product ("Ponni Rice 5 kg").
- quantity is the number of units purchased or in stock, as a number. unit is the unit printed (kg, pcs, box, litre, metre) or null.
- purchaseRate is the price per unit the shop pays, before GST, never the line total. mrp is the printed MRP per unit. sellingPrice only if the document states a selling or retail price for the shop to charge; otherwise null.
- If the document gives only a line total, divide by quantity for the per-unit rate when quantity is clear; otherwise leave the rate null.
- category: a short shop department (for example "Rice & Grains", "Dairy", "Sarees", "Plumbing") only when it is obvious from the product or the document; otherwise null.
- Never invent a number, a product or a category. If a value is unreadable, use null. If the document is not an invoice, delivery note or stock/price list, return no lines.
- Amounts are Indian Rupees.`

const PROMPT = "Extract every product line from this document."

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim()

/** The rows the review screen starts from. A purchase rate with no MRP leaves the selling price empty for the owner's markup. */
export function rowsFromInvoice(a: InvoiceAnswer): ImportRow[] {
  const rows: ImportRow[] = []
  for (const l of a.lines) {
    const name = clean(l.name)
    if (name.length < 2) continue
    const money = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? Math.round(v) : null)
    rows.push({
      ...NO_DETAILS,
      name: name.slice(0, 80),
      category: clean(l.category).slice(0, 40) || null,
      price: money(l.sellingPrice),
      mrp: money(l.mrp),
      cost: money(l.purchaseRate),
      stock: l.quantity !== null && Number.isFinite(l.quantity) && l.quantity >= 0 ? Math.floor(l.quantity) : null,
      unit: clean(l.unit).slice(0, 30) || null,
      description: clean(l.description).slice(0, 400),
    })
  }
  return rows
}

export type InvoiceResult = { rows: ImportRow[]; supplier: string | null; invoiceNumber: string | null; invoiceDate: string | null }

/** Null when the model could not read the document at all (blocked, unreachable, unusable answer). An empty `rows` means it read it and found no products. */
export async function extractInvoice(vision: VisionClient, input: { images?: VisionImage[]; documents?: VisionDocument[] }): Promise<InvoiceResult | null> {
  const a = await vision.json({ system: SYSTEM, prompt: PROMPT, images: input.images, documents: input.documents, jsonSchema: SCHEMA, validate: answer, maxTokens: 16_000 })
  if (!a) return null
  return { rows: rowsFromInvoice(a), supplier: clean(a.supplier) || null, invoiceNumber: clean(a.invoiceNumber) || null, invoiceDate: clean(a.invoiceDate) || null }
}
