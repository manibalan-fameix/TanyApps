import { z } from "zod"

/**
 * Bulk product import. A spreadsheet (xlsx or csv, read in the browser), an ERP stock export or an AI-read purchase invoice all end up as
 * the same thing: a list of `ImportRow`s the owner reviews, then one server call that creates or updates products. This module is the pure
 * part: mapping columns, cleaning values, merging duplicates and deciding what each row will do. It has no database and no I/O.
 */

export const MAX_IMPORT_ROWS = 1000

/** What a column can mean. `cost` (purchase rate) is never stored; it only prices a row that has no selling price. */
export const IMPORT_FIELDS = ["name", "category", "price", "mrp", "cost", "stock", "unit", "description", "brand", "barcode", "hsn", "gst", "packSize", "veg", "shelfLife", "origin", "featured", "imageUrl"] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const FIELD_LABEL: Record<ImportField, string> = {
  name: "Product name",
  category: "Category",
  price: "Selling price",
  mrp: "MRP (original price)",
  cost: "Purchase rate",
  stock: "Stock quantity",
  unit: "Unit",
  description: "Description",
  brand: "Brand",
  barcode: "Barcode (EAN)",
  hsn: "HSN code",
  gst: "GST %",
  packSize: "Pack size",
  veg: "Veg / Non-veg",
  shelfLife: "Shelf life",
  origin: "Country / state of origin",
  featured: "Featured",
  imageUrl: "Image URL",
}

/** The extra facts a product page shows. Stored together in one column; every key is optional. */
export type ProductDetails = { brand?: string; barcode?: string; hsn?: string; gst?: number; packSize?: string; shelfLife?: string; origin?: string; unit?: string }

export type ImportRow = {
  name: string
  category: string | null
  /** Selling price in whole rupees. Null until the owner (or a markup) sets one. */
  price: number | null
  mrp: number | null
  cost: number | null
  stock: number | null
  unit: string | null
  description: string
  brand: string | null
  barcode: string | null
  hsn: string | null
  gst: number | null
  packSize: string | null
  /** True for vegetarian, false for non-vegetarian, null when the file does not say. */
  veg: boolean | null
  shelfLife: string | null
  origin: string | null
  featured: boolean | null
  imageUrl: string | null
}

/** The optional facts of a row, all empty. Spread it first when building a row by hand. */
export const NO_DETAILS = { brand: null, barcode: null, hsn: null, gst: null, packSize: null, veg: null, shelfLife: null, origin: null, featured: null, imageUrl: null } as const

/** Lower-case letters and digits only, so "Item Name", "item_name" and "ITEM-NAME" are the same header. */
export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** Header spellings seen in ERP and billing exports (Tally, Busy, Marg, Vyapar, Zoho, plain Excel), per field. First match wins. */
const SYNONYMS: Record<ImportField, string[]> = {
  name: ["name", "productname", "itemname", "product", "item", "particulars", "itemdescription", "descriptionofgoods", "descriptionofgoodsservices", "goodsdescription", "materialname", "articlename", "productdescription", "stockitem", "stockitemname"],
  category: ["category", "itemcategory", "productcategory", "group", "itemgroup", "stockgroup", "department", "dept", "section", "type", "producttype"],
  price: ["price", "sellingprice", "saleprice", "salesprice", "sp", "retailprice", "salerate", "salesrate", "rate", "unitprice", "ourprice", "offerprice"],
  mrp: ["mrp", "maxretailprice", "maximumretailprice", "listprice", "originalprice", "compareatprice", "regularprice"],
  cost: ["cost", "costprice", "purchaseprice", "purchaserate", "buyingprice", "buyprice", "landingcost", "ptr", "pts", "purchasecost", "netrate"],
  stock: ["stock", "qty", "quantity", "closingstock", "closingqty", "closingquantity", "onhand", "qtyonhand", "balance", "balanceqty", "currentstock", "availablestock", "availableqty", "inventory", "openingstock", "stockquantity", "quantitybilled", "billedqty"],
  unit: ["unit", "uom", "unitofmeasure", "units", "size", "weight", "measure"],
  description: ["description", "details", "about", "notes", "remarks", "productdetails", "longdescription"],
  brand: ["brand", "brandname", "manufacturer", "make", "company"],
  barcode: ["barcode", "barcodeean", "ean", "upc", "gtin", "sku", "itemcode", "productcode"],
  hsn: ["hsn", "hsncode", "hsnsac", "hsnsaccode"],
  gst: ["gst", "gstpercent", "gstrate", "taxrate", "tax", "igst", "gst%"],
  packSize: ["packsize", "pack", "netweight", "netquantity", "netqty", "packingsize"],
  veg: ["veg", "vegnonveg", "vegornonveg", "foodtype", "diet", "dietarytype"],
  shelfLife: ["shelflife", "bestbefore", "expiry", "expirydays", "usebefore"],
  origin: ["origin", "countrystateoforigin", "countryoforigin", "stateoforigin", "madein", "source"],
  featured: ["featured", "bestseller", "isfeatured", "popular"],
  imageUrl: ["imageurl", "image", "photo", "photourl", "picture", "imagelink", "thumbnail"],
}

export type ColumnMap = Partial<Record<ImportField, number>>

/** Guesses which column is which from the header row. A column is used for at most one field; exact names beat partial matches. */
export function autoMap(headers: readonly string[]): ColumnMap {
  const map: ColumnMap = {}
  const taken = new Set<number>()
  const squashed = headers.map((h) => squash(String(h ?? "")))
  // Pass 1: exact synonyms, in the order the synonyms are listed. Pass 2: a header that merely contains a strong word ("Closing Stock (Qty)").
  for (const pass of [0, 1] as const) {
    for (const field of IMPORT_FIELDS) {
      if (map[field] !== undefined) continue
      for (const syn of SYNONYMS[field]) {
        const i = squashed.findIndex((h, idx) => !taken.has(idx) && h !== "" && (pass === 0 ? h === syn : syn.length >= 4 && h.includes(syn) && !isWeakOverlap(field, h)))
        if (i >= 0) {
          map[field] = i
          taken.add(i)
          break
        }
      }
    }
  }
  return map
}

/** Stops partial matches that would put a column under the wrong field (a "Purchase Price" must not become the selling price). */
function isWeakOverlap(field: ImportField, header: string): boolean {
  if (field === "price") return /purchase|cost|buy|landing|mrp|retailprice.*max|total|amount|tax|gst|discount/.test(header)
  if (field === "name") return /code|number|no$|hsn|sku|barcode|group|category/.test(header)
  if (field === "stock") return /value|amount|price|rate|cost/.test(header)
  if (field === "mrp") return false
  if (field === "barcode") return /hsn/.test(header)
  if (field === "description") return /item|goods|product/.test(header)
  return false
}

/** Turns "₹1,250.50", "Rs. 90", "12 pcs" or 12 into a number. Anything else is null. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const cleaned = value.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "").replace(/^inr/i, "")
  const m = /^-?\d+(\.\d+)?/.exec(cleaned)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim())
const rupees = (v: unknown) => {
  const n = toNumber(v)
  return n === null || n < 0 ? null : Math.round(n)
}
const units = (v: unknown) => {
  const n = toNumber(v)
  return n === null || n < 0 ? null : Math.floor(n)
}

/** "Yes", "Y", "true", "1" is true; "No", "N", "false", "0" is false; anything else is null. */
const yesNo = (v: unknown) => {
  const t = text(v).toLowerCase()
  return ["yes", "y", "true", "1"].includes(t) ? true : ["no", "n", "false", "0"].includes(t) ? false : null
}
/** "Veg" is true; "Non-veg", "Non Veg", "NV", "Egg" is false; anything else is null. */
const vegness = (v: unknown) => {
  const t = text(v).toLowerCase().replace(/[^a-z]/g, "")
  if (!t) return null
  if (/^(nonveg|nv|egg|nonvegetarian|meat)/.test(t)) return false
  if (/^(veg|v|vegetarian)$/.test(t)) return true
  return null
}
const url = (v: unknown) => {
  const t = text(v)
  return /^https?:\/\/\S+$/i.test(t) ? t : null
}

/** Reads the sheet's body rows into ImportRows using a column map. Blank rows are dropped; nothing is validated yet. */
export function rowsFromTable(body: readonly (readonly unknown[])[], map: ColumnMap): ImportRow[] {
  const cell = (r: readonly unknown[], f: ImportField) => (map[f] === undefined ? undefined : r[map[f] as number])
  const out: ImportRow[] = []
  for (const r of body) {
    if (r.every((c) => text(c) === "")) continue
    const unit = text(cell(r, "unit"))
    out.push({
      name: text(cell(r, "name")),
      category: text(cell(r, "category")) || null,
      price: rupees(cell(r, "price")),
      mrp: rupees(cell(r, "mrp")),
      cost: rupees(cell(r, "cost")),
      stock: units(cell(r, "stock")),
      unit: unit || null,
      description: text(cell(r, "description")),
      brand: text(cell(r, "brand")) || null,
      barcode: text(cell(r, "barcode")) || null,
      hsn: text(cell(r, "hsn")) || null,
      gst: (() => { const n = toNumber(cell(r, "gst")); return n === null || n < 0 || n > 100 ? null : n })(),
      packSize: text(cell(r, "packSize")) || null,
      veg: vegness(cell(r, "veg")),
      shelfLife: text(cell(r, "shelfLife")) || null,
      origin: text(cell(r, "origin")) || null,
      featured: yesNo(cell(r, "featured")),
      imageUrl: url(cell(r, "imageUrl")),
    })
  }
  return out
}

/** The name two rows must share to count as the same product: case, spacing and punctuation are ignored. */
export const matchKey = (name: string) => squash(name)

/** Rows with the same product name become one: quantities add up, and the first non-empty value wins for everything else. */
export function mergeDuplicates(rows: readonly ImportRow[]): { rows: ImportRow[]; merged: number } {
  const byKey = new Map<string, ImportRow>()
  let merged = 0
  for (const r of rows) {
    const key = matchKey(r.name)
    if (!key) {
      byKey.set(`#${byKey.size}`, { ...r })
      continue
    }
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...r })
      continue
    }
    merged++
    prev.stock = prev.stock === null && r.stock === null ? null : (prev.stock ?? 0) + (r.stock ?? 0)
    prev.category ??= r.category
    prev.price ??= r.price
    prev.mrp ??= r.mrp
    prev.cost ??= r.cost
    prev.unit ??= r.unit
    prev.description ||= r.description
    prev.brand ??= r.brand
    prev.barcode ??= r.barcode
    prev.hsn ??= r.hsn
    prev.gst ??= r.gst
    prev.packSize ??= r.packSize
    prev.veg ??= r.veg
    prev.shelfLife ??= r.shelfLife
    prev.origin ??= r.origin
    prev.featured ??= r.featured
    prev.imageUrl ??= r.imageUrl
  }
  return { rows: [...byKey.values()], merged }
}

/** Selling price for a row: its own, else its MRP, else purchase rate plus the owner's markup. Whole rupees, or null. */
export function resolvePrice(row: Pick<ImportRow, "price" | "mrp" | "cost">, markupPercent: number): number | null {
  if (row.price !== null) return row.price
  if (row.mrp !== null) return row.mrp
  if (row.cost !== null) return Math.round(row.cost * (1 + Math.max(0, markupPercent) / 100))
  return null
}

/** The shape the server accepts for each row. Validated again there: the browser is never trusted. */
export const importRowSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(80, "Name is too long (80 characters)."),
  category: z.string().trim().min(2).max(40).nullable().default(null),
  price: z.number().int().min(0).max(1_000_000),
  mrp: z.number().int().min(1).max(1_000_000).nullable().default(null),
  stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
  unit: z.string().trim().max(30).nullable().default(null),
  description: z.string().trim().max(400).default(""),
  brand: z.string().trim().max(80).nullable().default(null),
  barcode: z.string().trim().max(32).nullable().default(null),
  hsn: z.string().trim().max(16).nullable().default(null),
  gst: z.number().min(0).max(100).nullable().default(null),
  packSize: z.string().trim().max(40).nullable().default(null),
  veg: z.boolean().nullable().default(null),
  shelfLife: z.string().trim().max(40).nullable().default(null),
  origin: z.string().trim().max(60).nullable().default(null),
  featured: z.boolean().nullable().default(null),
  imageUrl: z.string().trim().url().max(1000).nullable().default(null),
})
export type CleanRow = z.infer<typeof importRowSchema>

export type RowProblem = { index: number; message: string }

/** Cleans rows for the server: prices resolved, optional text trimmed, and the problems listed for the review screen. */
export function validateRows(rows: readonly ImportRow[], markupPercent = 0): { clean: (CleanRow | null)[]; problems: RowProblem[] } {
  const problems: RowProblem[] = []
  const clean = rows.map((r, index) => {
    const price = resolvePrice(r, markupPercent)
    if (price === null) {
      problems.push({ index, message: "Needs a selling price." })
      return null
    }
    const parsed = importRowSchema.safeParse({
      name: r.name,
      category: r.category && r.category.length >= 2 ? r.category.slice(0, 40) : null,
      price,
      mrp: r.mrp !== null && r.mrp > price ? r.mrp : null,
      stock: r.stock,
      unit: r.unit ? r.unit.slice(0, 30) : null,
      description: r.description.slice(0, 400),
      brand: r.brand?.slice(0, 80) || null,
      barcode: r.barcode?.slice(0, 32) || null,
      hsn: r.hsn?.slice(0, 16) || null,
      gst: r.gst,
      packSize: r.packSize?.slice(0, 40) || null,
      veg: r.veg,
      shelfLife: r.shelfLife?.slice(0, 40) || null,
      origin: r.origin?.slice(0, 60) || null,
      featured: r.featured,
      imageUrl: r.imageUrl && /^https:\/\//i.test(r.imageUrl) ? r.imageUrl : null,
    })
    if (!parsed.success) {
      problems.push({ index, message: parsed.error.issues[0].message })
      return null
    }
    return parsed.data
  })
  return { clean, problems }
}

export type StockMode = "set" | "add"
export type ExistingProduct = { id: string; name: string; stockQuantity: number | null; categoryId: string | null; details?: ProductDetails }

export type PlannedRow =
  | { action: "create"; row: CleanRow }
  | { action: "update"; row: CleanRow; existing: ExistingProduct; newStock: number | null }
  | { action: "skip"; row: CleanRow; existing: ExistingProduct }

/**
 * Decides what each row does. A product whose name matches an existing one is updated, never duplicated: its price (and MRP) follow the
 * file, and its stock is replaced ("set": a stock sheet is the truth) or increased ("add": a purchase invoice brings more units).
 * With `updateExisting` off, matches are skipped and only new products are created.
 */
export function planImport(rows: readonly CleanRow[], existing: readonly ExistingProduct[], opts: { mode: StockMode; updateExisting: boolean }): PlannedRow[] {
  const byKey = new Map(existing.map((e) => [matchKey(e.name), e]))
  return rows.map((row) => {
    const found = byKey.get(matchKey(row.name))
    if (!found) return { action: "create", row }
    if (!opts.updateExisting) return { action: "skip", row, existing: found }
    const newStock = row.stock === null ? found.stockQuantity : opts.mode === "add" ? (found.stockQuantity ?? 0) + row.stock : row.stock
    return { action: "update", row, existing: found, newStock }
  })
}

export const summarisePlan = (plan: readonly PlannedRow[]) => ({
  create: plan.filter((p) => p.action === "create").length,
  update: plan.filter((p) => p.action === "update").length,
  skip: plan.filter((p) => p.action === "skip").length,
})

/** What the product page shows besides price and description, from a cleaned row. Empty values are left out. */
export function detailsOf(row: CleanRow): ProductDetails {
  const d: ProductDetails = {}
  if (row.brand) d.brand = row.brand
  if (row.barcode) d.barcode = row.barcode
  if (row.hsn) d.hsn = row.hsn
  if (row.gst !== null) d.gst = row.gst
  if (row.packSize) d.packSize = row.packSize
  if (row.shelfLife) d.shelfLife = row.shelfLife
  if (row.origin) d.origin = row.origin
  if (row.unit) d.unit = row.unit
  return d
}

/** A starter spreadsheet owners can fill in. Quoted, so a comma in a product name cannot shift the columns. */
export function templateCsv(sample: readonly { name: string; category: string; price: string }[]): string {
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
  const head = ["Product name", "Category", "Selling price", "MRP", "Stock", "Unit", "Description"]
  const lines = sample.map((s) => [s.name, s.category, s.price.replace(/[^\d]/g, ""), "", "10", "", ""].map(q).join(","))
  return [head.map(q).join(","), ...lines].join("\r\n") + "\r\n"
}

/** A small CSV reader (quotes, escaped quotes, CRLF, a BOM, commas or semicolons) so csv needs no library. */
export function parseCsv(input: string): string[][] {
  const src = input.replace(/^﻿/, "")
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ""
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? "\t" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === delim) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/**
 * Finds the header row in a sheet that starts with a title block ("ABC Traders, Stock Report, 01-Apr to 30-Sep") like ERPs print.
 * It is the first of the top rows with the most recognisable column names.
 */
export function findHeaderRow(table: readonly (readonly unknown[])[]): number {
  let best = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const score = Object.keys(autoMap(table[i].map((c) => text(c)))).length
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }
  return best
}
