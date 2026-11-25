"use client"

import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, ComputerIcon, DragDropVerticalIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Reorder, useDragControls } from "motion/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"

import { CategoryIcon } from "@/components/restaurant/category-icon"
import { PREVIEW_DRAFT, PREVIEW_READY } from "@/components/restaurant/store/preview-home"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { saveHomepage } from "@/lib/restaurant/admin-actions"
import { type HomeSectionId, type Homepage, MAX_ROW_PRODUCTS, homepageSchema } from "@/lib/restaurant/homepage"
import { toast } from "@/lib/toast"
import { cn } from "@/lib/utils"

type Product = { id: string; name: string; imageUrl: string | null }
type Category = { id: string; name: string }

const SECTION: Record<HomeSectionId, { name: string; about: string }> = {
  banners: { name: "Banners", about: "Your offer cards at the top" },
  categories: { name: "Category circles", about: "Round shortcuts to each category" },
  picks: { name: "Popular row", about: "“Popular Now” or “Top Picks”" },
  offers: { name: "Offers row", about: "“Offers for You”" },
  catalogue: { name: "All categories", about: "Every category with its products" },
}

const LINK = "font-medium text-foreground underline underline-offset-4"
const DESKTOP_WIDTH = 1280
const PHONE_WIDTH = 390

/** Edits the store's home page, section by section in the order customers see them, beside a live preview of the real page. */
export function HomepageEditor({ initial, owner, itemsNoun, bannersShowing, categories, products }: { initial: Homepage; owner: boolean; itemsNoun: string; bannersShowing: number; categories: Category[]; products: Product[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [open, setOpen] = useState<HomeSectionId | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const order = draft.sections.map((s) => s.id)
  const reorder = (ids: HomeSectionId[]) => setDraft((d) => ({ ...d, sections: ids.map((id) => d.sections.find((s) => s.id === id)!) }))
  const move = (id: HomeSectionId, by: number) => {
    const from = order.indexOf(id)
    const to = from + by
    if (to < 0 || to >= order.length) return
    const next = [...order]
    next.splice(to, 0, ...next.splice(from, 1))
    reorder(next)
  }
  const show = (id: HomeSectionId, visible: boolean) => setDraft((d) => ({ ...d, sections: d.sections.map((s) => (s.id === id ? { ...s, visible } : s)) }))

  const save = () =>
    start(async () => {
      const res = await saveHomepage(draft)
      if (!res.ok) return void toast.error(res.error)
      setSaved(draft)
      toast.success("Home page saved. Customers see it now.")
      router.refresh()
    })

  const settings = (id: HomeSectionId) => {
    if (id === "banners")
      return (
        <p className="text-sm text-muted-foreground">
          {bannersShowing === 0 ? "No banner is showing, so this section is empty. " : `${bannersShowing} ${bannersShowing === 1 ? "banner is" : "banners are"} showing. `}
          <Link href="/banners" className={LINK}>
            Edit banners
          </Link>
        </p>
      )
    if (id === "catalogue")
      return (
        <p className="text-sm text-muted-foreground">
          Filled from your {itemsNoun}.{" "}
          <Link href="/menu" className={LINK}>
            Edit {itemsNoun}
          </Link>{" "}
          or{" "}
          <Link href="/categories" className={LINK}>
            change the category order
          </Link>
          .
        </p>
      )
    if (id === "categories")
      return categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No category has {itemsNoun} yet.</p>
      ) : (
        <div className="grid gap-2">
          {categories.map((c) => (
            <Label key={c.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                disabled={!owner}
                checked={!draft.hiddenCategoryIds.includes(c.id)}
                onCheckedChange={(on) => setDraft((d) => ({ ...d, hiddenCategoryIds: on ? d.hiddenCategoryIds.filter((x) => x !== c.id) : [...d.hiddenCategoryIds, c.id] }))}
              />
              <CategoryIcon name={c.name} className="size-7 rounded-full" iconClassName="size-4" />
              {c.name}
            </Label>
          ))}
          <p className="text-sm text-muted-foreground">
            <Link href="/categories" className={LINK}>
              Change names or order
            </Link>
          </p>
        </div>
      )
    const row = draft[id]
    return (
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-title`}>Heading</Label>
          <Input id={`${id}-title`} disabled={!owner} maxLength={60} value={row.title} placeholder={id === "offers" ? "Offers for You" : "Automatic: Popular Now or Top Picks"} onChange={(e) => setDraft((d) => ({ ...d, [id]: { ...d[id], title: e.target.value } }))} />
        </div>
        {id === "offers" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="offers-subtitle">Line under the heading</Label>
            <Input id="offers-subtitle" disabled={!owner} maxLength={120} value={draft.offers.subtitle} placeholder="Automatic: your coupon, or a short line" onChange={(e) => setDraft((d) => ({ ...d, offers: { ...d.offers, subtitle: e.target.value } }))} />
          </div>
        ) : null}
        <ProductChooser
          disabled={!owner}
          products={products}
          chosen={row.productIds}
          automatic={id === "offers" ? `${itemsNoun} that have an offer` : `your bestsellers, or any ${itemsNoun} if none are marked`}
          onChange={(productIds) => setDraft((d) => ({ ...d, [id]: { ...d[id], productIds } }))}
        />
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[25rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        {owner ? null : <p className="text-sm text-muted-foreground">Only the owner can change the home page.</p>}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Header and delivery bar</p>
          <p className="mt-1 text-muted-foreground">
            Always at the top.{" "}
            <Link href="/settings/business" className={LINK}>
              Logo and name
            </Link>
            {" · "}
            <Link href="/settings/theme" className={LINK}>
              Colours
            </Link>
            {" · "}
            <Link href="/settings/ordering" className={LINK}>
              Delivery and pickup
            </Link>
          </p>
        </div>

        <Reorder.Group axis="y" values={order} onReorder={owner ? reorder : () => {}} className="flex flex-col gap-3">
          {draft.sections.map((s, i) => (
            <SectionCard
              key={s.id}
              id={s.id}
              visible={s.visible}
              open={open === s.id}
              disabled={!owner}
              first={i === 0}
              last={i === draft.sections.length - 1}
              onToggle={() => setOpen((o) => (o === s.id ? null : s.id))}
              onShow={(v) => show(s.id, v)}
              onMove={(by) => move(s.id, by)}
            >
              {settings(s.id)}
            </SectionCard>
          ))}
        </Reorder.Group>

        {owner ? (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background py-3">
            <Button disabled={!dirty || pending} onClick={save}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
            <Button variant="outline" disabled={!dirty || pending} onClick={() => setDraft(saved)}>
              Discard
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setDraft(homepageSchema.parse({ sections: Object.keys(SECTION).map((id) => ({ id, visible: true })) }))}>
              Use default layout
            </Button>
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {dirty ? "Not saved yet" : ""}
            </span>
          </div>
        ) : null}
      </div>

      <Preview draft={draft} />
    </div>
  )
}

function SectionCard({ id, visible, open, disabled, first, last, onToggle, onShow, onMove, children }: { id: HomeSectionId; visible: boolean; open: boolean; disabled: boolean; first: boolean; last: boolean; onToggle: () => void; onShow: (v: boolean) => void; onMove: (by: number) => void; children: React.ReactNode }) {
  const drag = useDragControls()
  const { name, about } = SECTION[id]
  return (
    <Reorder.Item value={id} dragListener={false} dragControls={drag} className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          disabled={disabled}
          aria-label={`Move ${name}: drag, or use the arrow buttons`}
          onPointerDown={(e) => !disabled && drag.start(e)}
          className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
        >
          <HugeiconsIcon icon={DragDropVerticalIcon} strokeWidth={1.75} className="size-4" />
        </button>
        <button type="button" aria-expanded={open} onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className={cn("block truncate text-sm font-medium", !visible && "text-muted-foreground line-through")}>{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{about}</span>
        </button>
        <Button variant="ghost" size="sm" className="shrink-0" aria-label={`${open ? "Close" : "Edit"} ${name}`} onClick={onToggle}>
          {open ? "Close" : "Edit"}
        </Button>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${name} up`} disabled={disabled || first} onClick={() => onMove(-1)}>
            <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Move ${name} down`} disabled={disabled || last} onClick={() => onMove(1)}>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>
        <Switch aria-label={`Show ${name}`} checked={visible} disabled={disabled} onCheckedChange={(v) => onShow(Boolean(v))} />
      </div>
      {open ? <div className="border-t p-3">{children}</div> : null}
    </Reorder.Item>
  )
}

/** The products of one row: automatic, or up to twelve chosen ones in the owner's order. */
function ProductChooser({ products, chosen, automatic, disabled, onChange }: { products: Product[]; chosen: string[]; automatic: string; disabled: boolean; onChange: (ids: string[]) => void }) {
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState("")
  const byId = new Map(products.map((p) => [p.id, p]))
  const selected = chosen.flatMap((id) => byId.get(id) ?? [])
  const found = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
  const swap = (i: number, j: number) => {
    const next = selected.map((p) => p.id)
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="grid gap-2">
      <Label>Products</Label>
      {selected.length === 0 ? (
        <p className="text-sm text-muted-foreground">Automatic: shows {automatic}.</p>
      ) : (
        <ol className="grid gap-1">
          {selected.map((p, i) => (
            <li key={p.id} className="flex items-center gap-2 rounded-md border p-1.5 text-sm">
              <Thumb product={p} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${p.name} earlier`} disabled={disabled || i === 0} onClick={() => swap(i, i - 1)}>
                <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Move ${p.name} later`} disabled={disabled || i === selected.length - 1} onClick={() => swap(i, i + 1)}>
                <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.name}`} disabled={disabled} onClick={() => onChange(chosen.filter((id) => id !== p.id))}>
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => { setSearch(""); setPicking(true) }}>
          Choose products
        </Button>
        {selected.length ? (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([])}>
            Back to automatic
          </Button>
        ) : null}
      </div>
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose products</DialogTitle>
            <DialogDescription>
              {selected.length} of {MAX_ROW_PRODUCTS} chosen. The phone shows the first 8.
            </DialogDescription>
          </DialogHeader>
          <Input type="search" aria-label="Search products" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {found.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No products match.</li> : null}
            {found.map((p) => {
              const on = chosen.includes(p.id)
              return (
                <li key={p.id}>
                  <Label className="flex items-center gap-2 p-2 font-normal">
                    <Checkbox checked={on} disabled={!on && selected.length >= MAX_ROW_PRODUCTS} onCheckedChange={(v) => onChange(v ? [...selected.map((x) => x.id), p.id] : chosen.filter((id) => id !== p.id))} />
                    <Thumb product={p} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  </Label>
                </li>
              )
            })}
          </ul>
          <Button onClick={() => setPicking(false)}>Done</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Thumb({ product }: { product: Product }) {
  return product.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.imageUrl} alt="" className="size-7 shrink-0 rounded-md border bg-muted object-cover" />
  ) : (
    <span className="size-7 shrink-0 rounded-md border bg-muted" />
  )
}

/** The real home page in a frame, at a desktop or phone width and scaled to fit, fed with the layout being edited. */
function Preview({ draft }: { draft: Homepage }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop")
  const [width, setWidth] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const latest = useRef(draft)

  const send = useCallback(() => frame.current?.contentWindow?.postMessage({ type: PREVIEW_DRAFT, layout: latest.current }, window.location.origin), [])
  useEffect(() => {
    latest.current = draft
    send()
  }, [draft, send])
  // The page inside says when it is ready to be told (after loading, and after switching size).
  useEffect(() => {
    const ready = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.source === frame.current?.contentWindow && e.data?.type === PREVIEW_READY) send()
    }
    window.addEventListener("message", ready)
    return () => window.removeEventListener("message", ready)
  }, [send])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new ResizeObserver(() => setWidth(el.clientWidth))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  const screen = device === "desktop" ? DESKTOP_WIDTH : PHONE_WIDTH
  const scale = width ? Math.min(1, width / screen) : 1
  const height = 760

  return (
    <div className="flex min-w-0 flex-col gap-2 xl:sticky xl:top-4 xl:self-start">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Preview</p>
        <Tabs value={device} onValueChange={(v) => setDevice(v as "desktop" | "phone")}>
          <TabsList>
            <TabsTrigger value="desktop">
              <HugeiconsIcon icon={ComputerIcon} strokeWidth={2} className="size-4" />
              Desktop
            </TabsTrigger>
            <TabsTrigger value="phone">
              <HugeiconsIcon icon={SmartPhone01Icon} strokeWidth={2} className="size-4" />
              Phone
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div ref={box} className="w-full overflow-hidden rounded-lg border bg-muted/40">
        <div className="mx-auto overflow-hidden" style={{ width: screen * scale, height }}>
          <iframe ref={frame} title="Home page preview" src="/homepage-preview" onLoad={send} style={{ width: screen, height: height / scale, transform: `scale(${scale})`, transformOrigin: "top left" }} className="border-0 bg-background" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Scroll inside the preview to see the whole page. Links are switched off here.</p>
    </div>
  )
}
