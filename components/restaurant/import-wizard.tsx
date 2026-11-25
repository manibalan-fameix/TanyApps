"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  AiMagicIcon,
  Camera01Icon,
  Download01Icon,
  FileSpreadsheetIcon,
  Invoice01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { commitImport, previewImport, type PreviewResult, type RowPlan } from "@/app/(admin)/(shell)/menu/import/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImportPreviewTable } from "@/components/restaurant/import-preview-table"
import { PopupFooter } from "@/components/restaurant/popup"
import { resizeToJpeg } from "@/lib/image/resize"
import { toast } from "@/lib/toast"
import {
  FIELD_LABEL,
  IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  type ColumnMap,
  type ImportField,
  type ImportRow,
  type StockMode,
  autoMap,
  findHeaderRow,
  mergeDuplicates,
  parseCsv,
  rowsFromTable,
  templateCsv,
} from "@/lib/restaurant/bulk-import"
import { cn } from "@/lib/utils"

type Source = "invoice" | "spreadsheet"
type Row = ImportRow & { include: boolean }
type Table2D = unknown[][]

const NONE = "none"

const SOURCES: { key: Source; title: string; body: string; icon: IconSvgElement; badge?: string }[] = [
  { key: "invoice", title: "Scan an invoice or stock report", body: "Take a photo or upload the PDF of a purchase invoice or an ERP stock or price report. AI reads every line for you.", icon: Invoice01Icon, badge: "AI" },
  { key: "spreadsheet", title: "Upload a spreadsheet", body: "An Excel (.xlsx) or CSV file, such as a stock export from Tally, Busy, Marg or Vyapar. Columns are matched for you.", icon: FileSpreadsheetIcon },
]

/** The row without the screen-only tick box, which is all the server is sent. */
const plain = (r: Row): ImportRow => ({ name: r.name, category: r.category, price: r.price, mrp: r.mrp, cost: r.cost, stock: r.stock, unit: r.unit, description: r.description, brand: r.brand, barcode: r.barcode, hsn: r.hsn, gst: r.gst, packSize: r.packSize, veg: r.veg, shelfLife: r.shelfLife, origin: r.origin, featured: r.featured, imageUrl: r.imageUrl })

export function ImportWizard({ itemNoun, itemsNoun, catalogue, sample, onFinished }: { itemNoun: string; itemsNoun: string; catalogue: string; sample: { name: string; category: string; price: string }[]; /** Inside a side panel: closes it instead of linking to the list. */ onFinished?: () => void }) {
  const [source, setSource] = useState<Source>("invoice")
  const [stage, setStage] = useState<"pick" | "review" | "done">("pick")
  const [reading, setReading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<{ supplier: string | null; invoiceNumber: string | null; fileName: string } | null>(null)
  // Spreadsheet only: the raw sheet, so columns can be re-mapped.
  const [sheet, setSheet] = useState<{ header: string[]; body: Table2D; map: ColumnMap } | null>(null)
  const [mode, setMode] = useState<StockMode>("add")
  const [updateExisting, setUpdateExisting] = useState(true)
  const [markup, setMarkup] = useState("20")
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [pending, startCommit] = useTransition()
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; categories: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const markupPct = Math.min(1000, Number(markup) || 0)
  const included = useMemo(() => rows.filter((r) => r.include), [rows])
  const options = useMemo(() => ({ mode, updateExisting, markupPercent: markupPct }), [mode, updateExisting, markupPct])
  const needsMarkup = rows.some((r) => r.include && r.price === null && r.mrp === null && r.cost !== null)

  // Ask the server what each row would do, a moment after the owner stops editing. A late answer for an older edit is ignored.
  const seq = useRef(0)
  useEffect(() => {
    if (stage !== "review" || included.length === 0) return
    const mine = ++seq.current
    const t = setTimeout(async () => {
      const res = await previewImport(
        included.map(plain),
        options,
      ).catch(() => null)
      if (mine === seq.current && res) setPreview(res)
    }, 450)
    return () => clearTimeout(t)
  }, [stage, included, options])

  const planFor = (index: number): RowPlan | null => {
    if (!preview?.ok) return null
    let n = -1
    for (let i = 0; i <= index; i++) if (rows[i]?.include) n++
    return rows[index]?.include ? (preview.rows[n] ?? null) : null
  }

  const load = (list: ImportRow[], next: Source, info: typeof meta) => {
    const merged = mergeDuplicates(list)
    const capped = merged.rows.slice(0, MAX_IMPORT_ROWS)
    if (capped.length === 0) {
      toast.error(`No ${itemsNoun} found in that file.`)
      return false
    }
    setRows(capped.map((r) => ({ ...r, include: r.name.length >= 2 })))
    setMeta(info)
    setSource(next)
    setMode(next === "invoice" ? "add" : "set")
    setPreview(null)
    setStage("review")
    if (merged.rows.length > MAX_IMPORT_ROWS) toast.warning(`Only the first ${MAX_IMPORT_ROWS} rows were loaded. Import the rest in a second file.`)
    if (merged.merged > 0) toast.info(`${merged.merged} repeated ${merged.merged === 1 ? "line was" : "lines were"} combined.`)
    return true
  }

  async function readInvoice(file: File | undefined) {
    if (!file) return
    setReading(true)
    try {
      let upload: Blob = file
      // A phone photo is resized first: faster to send, and the picture's location data is dropped.
      if (file.type.startsWith("image/")) upload = (await resizeToJpeg(file, 2200, 0.88)).blob
      const form = new FormData()
      form.append("file", upload, file.name)
      const res = await fetch("/api/products/invoice", { method: "POST", body: form })
      const data = (await res.json().catch(() => ({}))) as { error?: string; rows?: ImportRow[]; supplier?: string | null; invoiceNumber?: string | null }
      if (!res.ok || !data.rows) {
        const msg: Record<string, string> = {
          unsupported: "Use a PDF, JPG, PNG or WebP file.",
          too_large: "That file is too large. The limit is 8 MB.",
          invalid: "That file could not be used.",
          rate_limited: "Too many scans for now. Try again in a little while.",
          no_ai: "Invoice scanning is not available right now. Upload a spreadsheet instead.",
          not_read: "We could not read that document. Try a clearer photo, or upload a spreadsheet.",
          no_access: "Your trial has ended. Add a payment method to keep editing.",
          unauthorised: "Please sign in again.",
        }
        toast.error(msg[data.error ?? ""] ?? "Something went wrong. Please try again.")
        return
      }
      if (data.rows.length === 0) {
        toast.error("That does not look like an invoice or a stock list. We found no products.")
        return
      }
      setSheet(null)
      load(data.rows, "invoice", { supplier: data.supplier ?? null, invoiceNumber: data.invoiceNumber ?? null, fileName: file.name })
    } catch {
      toast.error("Could not read that file. Try again.")
    } finally {
      setReading(false)
    }
  }

  async function readSpreadsheet(file: File | undefined) {
    if (!file) return
    setReading(true)
    try {
      const lower = file.name.toLowerCase()
      if (lower.endsWith(".xls")) {
        toast.error("Old .xls files are not supported. In Excel choose Save As, then .xlsx or CSV.")
        return
      }
      let table: Table2D
      if (lower.endsWith(".csv") || lower.endsWith(".txt") || file.type === "text/csv") table = parseCsv(await file.text())
      else if (lower.endsWith(".xlsx")) {
        const { readSheet } = await import("read-excel-file/browser")
        table = (await readSheet(file)) as Table2D
      } else {
        toast.error("Use an Excel (.xlsx) or CSV file.")
        return
      }
      if (table.length < 2) {
        toast.error("That file has no rows.")
        return
      }
      const h = findHeaderRow(table)
      const header = table[h].map((c) => String(c ?? "").trim())
      const body = table.slice(h + 1)
      const map = autoMap(header)
      if (map.name === undefined) {
        // Keep the sheet so the owner can say which column holds the names.
        setSheet({ header, body, map })
        setRows([])
        setMeta({ supplier: null, invoiceNumber: null, fileName: file.name })
        setSource("spreadsheet")
        setStage("review")
        return
      }
      setSheet({ header, body, map })
      load(rowsFromTable(body, map), "spreadsheet", { supplier: null, invoiceNumber: null, fileName: file.name })
    } catch {
      toast.error("Could not read that file. Check it opens in Excel, or save it as CSV.")
    } finally {
      setReading(false)
    }
  }

  function remap(field: ImportField, value: string) {
    if (!sheet) return
    const map: ColumnMap = { ...sheet.map }
    if (value === NONE) delete map[field]
    else {
      const idx = Number(value)
      // A column can only mean one thing.
      for (const f of IMPORT_FIELDS) if (map[f] === idx) delete map[f]
      map[field] = idx
    }
    setSheet({ ...sheet, map })
    const merged = mergeDuplicates(rowsFromTable(sheet.body, map)).rows.slice(0, MAX_IMPORT_ROWS)
    setRows(merged.map((r) => ({ ...r, include: r.name.length >= 2 })))
    setPreview(null)
  }

  const edit = (i: number, patch: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  function downloadTemplate() {
    const blob = new Blob([templateCsv(sample)], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `${itemsNoun}-template.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function commit() {
    startCommit(async () => {
      const res = await commitImport(
        included.map(plain),
        options,
        source,
      )
      if (res.ok) {
        setResult(res)
        setStage("done")
      } else toast.error(res.error)
    })
  }

  const counts = preview?.ok ? preview.counts : null
  const overLimit = preview?.ok && preview.capacityLeft !== null && counts !== null && counts.create > preview.capacityLeft
  const importable = counts ? counts.create + counts.update : 0

  // ---------- pick ----------
  if (stage === "pick")
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <div role="radiogroup" aria-label="Where are your products coming from?" className="grid gap-3 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={source === s.key}
              onClick={() => setSource(s.key)}
              className={cn(
                "flex flex-col items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                source === s.key && "border-primary bg-primary/5 ring-1 ring-primary",
              )}
            >
              <span className={cn("flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground", source === s.key && "bg-primary text-primary-foreground")}>
                <HugeiconsIcon icon={s.icon} strokeWidth={1.75} className="size-5" />
              </span>
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-2 font-medium">
                  {s.title}
                  {s.badge ? (
                    <Badge variant="secondary" className="gap-1">
                      <HugeiconsIcon icon={AiMagicIcon} className="size-3" />
                      {s.badge}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">{s.body}</span>
              </span>
            </button>
          ))}
        </div>

        {source === "invoice" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Works with supplier invoices, delivery challans and printed or exported ERP stock and price reports. Photos, PDF, JPG, PNG or WebP, up to 8 MB. You check every line before anything is saved.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={reading} onClick={() => fileRef.current?.click()}>
                {reading ? "Reading your document..." : "Choose a PDF or photo"}
              </Button>
              <Button variant="outline" disabled={reading} onClick={() => cameraRef.current?.click()}>
                <HugeiconsIcon icon={Camera01Icon} className="size-4" />
                Take a photo
              </Button>
            </div>
            <input ref={fileRef} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { void readInvoice(e.target.files?.[0]); e.target.value = "" }} />
            <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { void readInvoice(e.target.files?.[0]); e.target.value = "" }} />
            <p className="text-xs text-muted-foreground">The file is read once and not kept. Prices on a purchase invoice are what you paid, so you will set your selling price on the next screen.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Upload an .xlsx or .csv file with one {itemNoun} per row. Column names like Item Name, Category, Price, MRP, Qty or Closing Stock are recognised automatically, and you can fix any column on the next screen.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={reading} onClick={() => fileRef.current?.click()}>
                {reading ? "Reading your file..." : "Choose an Excel or CSV file"}
              </Button>
              <Button variant="outline" onClick={downloadTemplate}>
                <HugeiconsIcon icon={Download01Icon} className="size-4" />
                Download template
              </Button>
            </div>
            <input ref={fileRef} type="file" hidden accept=".xlsx,.csv,.txt,text/csv" onChange={(e) => { void readSpreadsheet(e.target.files?.[0]); e.target.value = "" }} />
            <p className="text-xs text-muted-foreground">Up to {MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows at a time. Your file is read in your browser and only the rows you confirm are sent.</p>
          </div>
        )}
      </div>
    )

  // ---------- done ----------
  if (stage === "done" && result)
    return (
      <div className="flex max-w-xl flex-col items-start gap-4 rounded-xl border bg-card p-6">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <HugeiconsIcon icon={Tick02Icon} className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Import complete</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.created} new {result.created === 1 ? itemNoun : itemsNoun} added, {result.updated} updated
            {result.skipped ? `, ${result.skipped} skipped` : ""}
            {result.categories ? `, ${result.categories} new ${result.categories === 1 ? "category" : "categories"}` : ""}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Photos are not part of an import. Open a {itemNoun} any time to add one.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onFinished ? (
            <Button onClick={onFinished}>View {catalogue.toLowerCase()}</Button>
          ) : (
            <Link href="/menu" className={cn(buttonVariants())}>View {catalogue.toLowerCase()}</Link>
          )}
          <Button variant="outline" onClick={() => { setStage("pick"); setRows([]); setResult(null); setSheet(null) }}>Import another file</Button>
        </div>
      </div>
    )

  // ---------- review ----------
  const unmappedName = sheet !== null && sheet.map.name === undefined
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{meta?.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {source === "invoice" ? [meta?.supplier, meta?.invoiceNumber ? `Invoice ${meta.invoiceNumber}` : null].filter(Boolean).join(" · ") || "Read by AI. Check each line." : "Check each row, then import."}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setStage("pick"); setRows([]); setPreview(null) }}>Choose a different file</Button>
      </div>

      {source === "invoice" ? (
        <Alert>
          <HugeiconsIcon icon={AiMagicIcon} className="size-4" />
          <AlertTitle>Read by AI, confirmed by you</AlertTitle>
          <AlertDescription>AI can misread a blurry line. Check names, quantities and prices before importing. Untick a row to leave it out.</AlertDescription>
        </Alert>
      ) : null}

      {sheet ? (
        <details open={unmappedName} className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">{unmappedName ? "Tell us which column is the product name" : "Columns (tap to change)"}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {IMPORT_FIELDS.map((f) => {
              const choices = [{ value: NONE, label: "Not in my file" }, ...sheet.header.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))]
              const value = sheet.map[f] === undefined ? NONE : String(sheet.map[f])
              return (
                <div key={f} className="grid gap-1.5">
                  <Label className="text-xs">{FIELD_LABEL[f]}{f === "name" ? " *" : ""}</Label>
                  <Select items={choices} value={value} onValueChange={(v) => remap(f, String(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {choices.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
        </details>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">When a {itemNoun} already exists</Label>
              <Select
                items={[{ value: "update", label: "Update its price and stock" }, { value: "skip", label: "Leave it as it is" }]}
                value={updateExisting ? "update" : "skip"}
                onValueChange={(v) => setUpdateExisting(v === "update")}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="update">Update its price and stock</SelectItem>
                  <SelectItem value="skip">Leave it as it is</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Stock quantities</Label>
              <Select
                items={[{ value: "add", label: "Add to current stock (new purchase)" }, { value: "set", label: "Replace current stock (stock count)" }]}
                value={mode}
                onValueChange={(v) => setMode(v as StockMode)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add to current stock (new purchase)</SelectItem>
                  <SelectItem value="set">Replace current stock (stock count)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {needsMarkup ? (
              <div className="grid gap-1.5">
                <Label htmlFor="markup" className="text-xs">Profit added to purchase rate (%)</Label>
                <Input id="markup" inputMode="numeric" value={markup} onChange={(e) => setMarkup(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} />
                <p className="text-xs text-muted-foreground">Used only for rows with no selling price or MRP. You can edit any price below.</p>
              </div>
            ) : null}
          </div>

          <ImportPreviewTable
            rows={rows}
            markupPct={markupPct}
            planFor={planFor}
            edit={edit}
            setAll={(include) => setRows((all) => all.map((r) => ({ ...r, include: include && r.name.length >= 2 })))}
          />

          {overLimit && preview?.ok ? (
            <Alert variant="destructive">
              <AlertTitle>Over your plan limit</AlertTitle>
              <AlertDescription>
                Your plan has room for {preview.capacityLeft} more {itemsNoun} and this file adds {counts?.create}. Untick some rows, or <Link href="/settings/billing" className="underline">upgrade your plan</Link>.
              </AlertDescription>
            </Alert>
          ) : null}

          <PopupFooter>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" role="status">
              {counts ? `${counts.create} new · ${counts.update} to update${counts.skip ? ` · ${counts.skip} already exist` : ""}${counts.invalid ? ` · ${counts.invalid} need attention` : ""}` : included.length === 0 ? "Nothing selected" : "Checking..."}
            </p>
            <Button disabled={pending || importable === 0 || Boolean(overLimit)} onClick={commit}>
              {pending ? "Importing..." : `Import ${importable || ""} ${importable === 1 ? itemNoun : itemsNoun}`.replace(/\s+/g, " ")}
            </Button>
          </div>
          </PopupFooter>
        </>
      ) : unmappedName ? (
        <p className="text-sm text-muted-foreground">Choose the column that holds your product names above and your rows will appear here.</p>
      ) : null}
    </div>
  )
}
