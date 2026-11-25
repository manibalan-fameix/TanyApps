"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { requestImageUpload, setProductPhoto } from "@/app/(admin)/(shell)/menu/actions"
import { SimpleTable } from "@/components/data-table/simple-table"
import { PopupFooter } from "@/components/restaurant/popup"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { resizeToJpeg } from "@/lib/image/resize"
import { matchPhotos } from "@/lib/restaurant/photo-match"
import { toast } from "@/lib/toast"

export type PhotoProduct = { id: string; name: string; hasPhoto: boolean }

const SKIP = "skip"
const MAX_FILES = 60
const MAX_EDGE = 1280

type PhotoPick = { key: string; file: File; preview: string; productId: string; state: "waiting" | "saving" | "saved" | "failed"; problem?: string }

/** Several of the owner's own photos at once: each is matched to a product by its file name, checked on screen, then uploaded. */
export function BulkPhotos({ products, itemNoun, onDone }: { products: PhotoProduct[]; itemNoun: string; onDone: () => void }) {
  const [picks, setPicks] = useState<PhotoPick[]>([])
  const [saving, setSaving] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // The previews are browser-only addresses; release them when the pop-up goes away.
  const previews = useRef<string[]>([])
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])

  function add(list: FileList | null) {
    const images = [...(list ?? [])].filter((f) => f.type.startsWith("image/"))
    if (images.length === 0) return toast.error("Choose image files.")
    const room = MAX_FILES - picks.length
    if (images.length > room) toast.warning(`Only ${MAX_FILES} photos at a time. The rest were left out.`)
    const chosen = images.slice(0, Math.max(room, 0))
    const taken = new Set(picks.map((p) => p.productId))
    const found = matchPhotos(chosen.map((f) => f.name), products.filter((p) => !taken.has(p.id)))
    setPicks((current) => [
      ...current,
      ...chosen.map((file, i): PhotoPick => {
        const preview = URL.createObjectURL(file)
        previews.current.push(preview)
        return { key: crypto.randomUUID(), file, preview, productId: found[i] ?? SKIP, state: "waiting" }
      }),
    ])
  }

  const change = (key: string, patch: Partial<PhotoPick>) => setPicks((current) => current.map((p) => (p.key === key ? { ...p, ...patch } : p)))
  const options = useMemo(() => [{ value: SKIP, label: "Don't use" }, ...[...products].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: p.name }))], [products])
  const toSave = picks.filter((p) => p.productId !== SKIP && p.state !== "saved")
  const unmatched = picks.filter((p) => p.productId === SKIP).length

  async function save() {
    setSaving(true)
    let saved = 0
    for (const pick of toSave) {
      change(pick.key, { state: "saving", problem: undefined })
      try {
        const { blob } = await resizeToJpeg(pick.file, MAX_EDGE)
        const target = await requestImageUpload("menu")
        if (!target.ok) throw new Error(target.error)
        const sent = await fetch(target.url, { method: target.method, headers: target.headers, body: blob })
        if (!sent.ok) throw new Error("Upload failed.")
        const res = await setProductPhoto(pick.productId, target.publicUrl)
        if (!res.ok) throw new Error(res.error)
        change(pick.key, { state: "saved" })
        saved++
      } catch (error) {
        change(pick.key, { state: "failed", problem: error instanceof Error && error.message ? error.message : "Could not use that photo." })
      }
    }
    setSaving(false)
    if (saved === toSave.length) {
      toast.success(`${saved} ${saved === 1 ? "photo" : "photos"} saved.`)
      onDone()
    } else toast.error(`${saved} of ${toSave.length} photos saved. Check the ones marked below.`)
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={picks.length ? "outline" : "default"} disabled={saving} onClick={() => input.current?.click()}>
          {picks.length ? "Add more" : "Choose photos"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Choose product photos"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ""
          }}
        />
        <p className="text-sm text-muted-foreground">
          {picks.length
            ? `${toSave.length} ready to save${unmatched ? ` · ${unmatched} without a ${itemNoun}: choose one, or leave it out` : ""}`
            : `Select many at once. A file called “Amul Butter 100g.jpg” goes to Amul Butter 100g.`}
        </p>
      </div>
      {picks.length ? (
        <SimpleTable
          searchPlaceholder="Search files..."
          columns={[{ title: "Photo" }, { title: "File" }, { title: itemNoun.charAt(0).toUpperCase() + itemNoun.slice(1) }, { title: "Result" }]}
          rows={picks.map((p) => {
            const product = products.find((x) => x.id === p.productId)
            // A product can take one photo from this batch.
            const free = options.filter((o) => o.value === SKIP || o.value === p.productId || !picks.some((x) => x.productId === o.value))
            return {
              id: p.key,
              cells: [
                // eslint-disable-next-line @next/next/no-img-element
                <img key="preview" src={p.preview} alt="" className="size-12 rounded-md border bg-muted object-cover" />,
                <span key="file" className="block max-w-56 truncate" title={p.file.name}>
                  {p.file.name}
                </span>,
                <Select key="product" items={free} value={p.productId} disabled={saving || p.state === "saved"} onValueChange={(v) => change(p.key, { productId: String(v), state: "waiting", problem: undefined })}>
                  <SelectTrigger className="w-56" aria-label={`Product for ${p.file.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {free.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
                p.state === "saved" ? (
                  <Badge key="r">Saved</Badge>
                ) : p.state === "saving" ? (
                  <span key="r" className="text-muted-foreground">Uploading...</span>
                ) : p.state === "failed" ? (
                  <span key="r" className="text-destructive">{p.problem}</span>
                ) : !product ? (
                  <span key="r" className="text-muted-foreground">Not used</span>
                ) : (
                  <Badge key="r" variant="outline">{product.hasPhoto ? "Replaces current photo" : "New photo"}</Badge>
                ),
              ],
            }
          })}
        />
      ) : null}
      <PopupFooter>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onDone}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || toSave.length === 0} onClick={save}>
            {saving ? "Saving..." : `Save ${toSave.length} ${toSave.length === 1 ? "photo" : "photos"}`}
          </Button>
        </div>
      </PopupFooter>
    </div>
  )
}
