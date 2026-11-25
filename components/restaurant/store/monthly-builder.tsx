"use client"

import { Add01Icon, MinusSignIcon, PauseIcon, PlayIcon, Restaurant01Icon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMemo, useState, useTransition } from "react"

import { saveMonthlyPlan, setMonthlyStatus } from "@/app/(tenant)/sites/[dealer]/monthly/actions"
import { AddressFormDialog } from "@/components/restaurant/store/address-form-dialog"
import { SavedAddressPicker } from "@/components/restaurant/store/saved-address-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/lib/toast"
import { formatRupees } from "@/lib/restaurant/menu"
import { MAX_DELIVERY_DAY, monthlyBill, ordinal } from "@/lib/restaurant/monthly"
import { type SavedAddress, matchingAddress } from "@/lib/restaurant/saved-address"
import type { MonthlyOffer } from "@/lib/restaurant/settings"
import type { StoreCategory, StoreDish } from "@/lib/restaurant/storefront"
import { cn } from "@/lib/utils"

export type MonthlyPlanView = {
  status: "active" | "paused" | "cancelled"
  name: string
  deliveryDay: number
  address: string
  pincode: string
  note: string
  lastError: string | null
  /** The date of the next delivery, already formatted. */
  next: string
  lines: { itemId: string; portion: string | null; qty: number }[]
  history: { code: string; month: string; total: number; saved: number; status: string }[]
}

/** One thing a customer can put on the list: a product, or one size of a product. */
type Choice = { key: string; itemId: string; portion: string | null; name: string; label: string; price: number; imageUrl: string | null; categoryId: string | null; available: boolean }

const keyOf = (itemId: string, portion: string | null) => `${itemId}|${portion ?? ""}`
const DAYS = Array.from({ length: MAX_DELIVERY_DAY }, (_, i) => ({ value: String(i + 1), label: `${ordinal(i + 1)} of every month` }))
const STATUS_LABEL = { active: "Active", paused: "Paused", cancelled: "Cancelled" } as const

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground/50", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className="size-5" />
      )}
    </span>
  )
}

const FRAME = "flex h-8 shrink-0 items-center rounded-lg border border-info bg-background text-xs font-bold text-info"

/** ADD, then - 1 +. Same control as the store and the chat, here on a list that lives in this page. */
function Qty({ qty, name, onChange }: { qty: number; name: string; onChange: (n: number) => void }) {
  if (qty === 0) {
    return (
      <button type="button" aria-label={`Add ${name}`} onClick={() => onChange(1)} className={cn(FRAME, "min-w-16 justify-center px-3 hover:bg-muted")}>
        ADD
      </button>
    )
  }
  return (
    <div className={FRAME}>
      <button type="button" aria-label={`Decrease ${name}`} onClick={() => onChange(qty - 1)} className="flex size-8 items-center justify-center rounded-l-lg hover:bg-muted">
        <HugeiconsIcon icon={MinusSignIcon} strokeWidth={2.5} className="size-3.5" />
      </button>
      <span className="min-w-5 text-center text-sm" aria-live="polite">{qty}</span>
      <button type="button" aria-label={`Increase ${name}`} onClick={() => onChange(Math.min(20, qty + 1))} className="flex size-8 items-center justify-center rounded-r-lg hover:bg-muted">
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2.5} className="size-3.5" />
      </button>
    </div>
  )
}

export function MonthlyBuilder({
  dishes,
  categories,
  offer,
  deliveryFee,
  canOrder,
  defaultName,
  plan,
  savedAddresses,
  centre,
  themeVars,
}: {
  dishes: StoreDish[]
  categories: StoreCategory[]
  offer: MonthlyOffer
  deliveryFee: number
  canOrder: boolean
  defaultName: string
  plan: MonthlyPlanView | null
  savedAddresses: SavedAddress[]
  centre: { lat: number; lng: number } | null
  themeVars: React.CSSProperties
}) {
  const [pending, start] = useTransition()
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries((plan?.lines ?? []).map((l) => [keyOf(l.itemId, l.portion), l.qty])))
  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<string>("all")
  const [form, setForm] = useState({ name: plan?.name ?? defaultName, day: String(plan?.deliveryDay ?? 5), address: plan?.address ?? "", pincode: plan?.pincode ?? "", note: plan?.note ?? "" })
  // With a saved address selected, its line and pincode are what the plan keeps. A new list starts on the newest one; an
  // existing list stays on whichever address it already uses.
  const [addresses, setAddresses] = useState(savedAddresses)
  const [addressId, setAddressId] = useState<string | null>(() => (plan ? matchingAddress(savedAddresses, plan)?.id : savedAddresses[0]?.id) ?? null)
  const [addingAddress, setAddingAddress] = useState(false)
  const chosen = addresses.find((a) => a.id === addressId) ?? null
  const [saved, setSaved] = useState<{ next: string } | null>(null)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)

  const choices = useMemo<Choice[]>(
    () =>
      dishes.flatMap<Choice>((d) =>
        d.portions.length > 0
          ? d.portions.map((p) => ({ key: keyOf(d.id, p.label), itemId: d.id, portion: p.label, name: d.name, label: p.label, price: p.price, imageUrl: d.imageUrl, categoryId: d.categoryId, available: d.isAvailable }))
          : [{ key: keyOf(d.id, null), itemId: d.id, portion: null, name: d.name, label: "", price: d.price, imageUrl: d.imageUrl, categoryId: d.categoryId, available: d.isAvailable }],
      ),
    [dishes],
  )

  const set = (key: string, n: number) =>
    setQty((all) => {
      const next = { ...all }
      if (n <= 0) delete next[key]
      else next[key] = n
      return next
    })

  const selected = choices.filter((c) => (qty[c.key] ?? 0) > 0)
  const count = selected.reduce((n, c) => n + (qty[c.key] ?? 0), 0)
  const subtotal = selected.reduce((n, c) => n + (qty[c.key] ?? 0) * c.price, 0)
  const bill = monthlyBill(subtotal, deliveryFee, offer)

  const q = query.trim().toLowerCase()
  const shown = choices.filter((c) => (cat === "all" || c.categoryId === cat) && (!q || `${c.name} ${c.label}`.toLowerCase().includes(q)))
  const cats = categories.filter((c) => dishes.some((d) => d.categoryId === c.id))

  const locked = plan?.status === "cancelled"
  const save = () =>
    start(async () => {
      setError(null)
      const res = await saveMonthlyPlan({
        name: form.name,
        deliveryDay: Number(form.day),
        address: chosen?.line ?? form.address,
        pincode: chosen?.pincode ?? form.pincode,
        note: form.note,
        lines: selected.map((c) => ({ itemId: c.itemId, portion: c.portion, qty: qty[c.key] })),
      })
      if (!res.ok) {
        setError({ field: res.field, message: res.error })
        toast.error(res.error)
        return
      }
      setSaved({ next: res.next })
      toast.success(`Saved. Your next delivery is on ${res.next}.`)
    })

  const changeStatus = (status: "active" | "paused" | "cancelled") =>
    start(async () => {
      const res = await setMonthlyStatus(status)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(status === "active" ? "Your monthly list is active." : status === "paused" ? "Paused. Nothing will be delivered until you resume." : "Cancelled. Your list is saved if you want to start again.")
      // The page reads the plan on the server, so reload it to show the new state.
      window.location.reload()
    })

  const fieldError = (field: string) => (error?.field === field ? <p className="text-sm text-destructive">{error.message}</p> : null)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-[calc(1rem+var(--safe-area-inset-top,0px))] pb-[calc(11rem+var(--safe-area-inset-bottom,0px))] md:py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monthly groceries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan && plan.status === "active" ? `Next delivery on ${plan.next}` : "Build your list once. We deliver it every month."}
          </p>
        </div>
        {plan ? <Badge variant={plan.status === "active" ? "default" : "secondary"}>{STATUS_LABEL[plan.status]}</Badge> : null}
      </div>

      {offer.percentOff > 0 || offer.freeDelivery ? (
        <p className="mt-4 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
          {[offer.percentOff > 0 ? `${offer.percentOff}% off every monthly bill${offer.maxDiscount ? ` (up to ₹${offer.maxDiscount})` : ""}` : null, offer.freeDelivery ? "free delivery" : null].filter(Boolean).join(" + ")}
        </p>
      ) : null}

      {plan?.lastError ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>We could not place last delivery</AlertTitle>
          <AlertDescription>{plan.lastError} Update your list below and we will try again.</AlertDescription>
        </Alert>
      ) : null}
      {!canOrder ? (
        <Alert className="mt-4">
          <AlertTitle>The shop is not taking orders right now</AlertTitle>
          <AlertDescription>You can still build your list. Deliveries start again when the shop reopens.</AlertDescription>
        </Alert>
      ) : null}

      {/* 1. The list so far */}
      <section className="mt-6" aria-labelledby="list-title">
        <h2 id="list-title" className="text-base font-semibold">Your monthly list {count > 0 ? <span className="font-normal text-muted-foreground">· {count} {count === 1 ? "item" : "items"}</span> : null}</h2>
        {selected.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here yet. Add items below, one by one.</p>
        ) : (
          <ul className="mt-2 divide-y overflow-hidden rounded-2xl border bg-card">
            {selected.map((c) => (
              <li key={c.key} className="flex items-center gap-3 p-2.5">
                <Thumb src={c.imageUrl} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-tight font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.label ? `${c.label} · ` : ""}{formatRupees(c.price)} · {formatRupees(c.price * (qty[c.key] ?? 0))}</p>
                  {!c.available ? <p className="text-xs font-medium text-destructive">Out of stock right now</p> : null}
                </div>
                <Qty qty={qty[c.key] ?? 0} name={c.name} onChange={(n) => set(c.key, n)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. Pick items */}
      <section className="mt-8" aria-labelledby="add-title">
        <h2 id="add-title" className="text-base font-semibold">Add items</h2>
        <div className="relative mt-2">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" className="h-10 rounded-xl pl-9" />
        </div>
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ id: "all", name: "All" }, ...cats].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
              className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors", cat === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {c.name}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing matches. Try another word or category.</p>
        ) : (
          <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card">
            {shown.map((c) => (
              <li key={c.key} className="flex items-center gap-3 p-2.5">
                <Thumb src={c.imageUrl} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-tight font-semibold">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.label ? `${c.label} · ` : ""}<span className="font-bold text-foreground">{formatRupees(c.price)}</span></p>
                </div>
                {c.available ? <Qty qty={qty[c.key] ?? 0} name={c.name} onChange={(n) => set(c.key, n)} /> : <span className="text-xs font-medium text-muted-foreground">Out of stock</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Where and when */}
      <section className="mt-8" aria-labelledby="where-title">
        <h2 id="where-title" className="text-base font-semibold">Delivery</h2>
        <FieldGroup className="mt-3">
          <Field>
            <FieldLabel htmlFor="mg-name">Name</FieldLabel>
            <Input id="mg-name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            {fieldError("name")}
          </Field>
          <Field>
            <FieldLabel htmlFor="mg-day">Deliver on</FieldLabel>
            <Select items={DAYS} value={form.day} onValueChange={(v) => setForm({ ...form, day: String(v) })}>
              <SelectTrigger id="mg-day" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
            <FieldDescription>Days run 1 to {MAX_DELIVERY_DAY} so every month has your date.</FieldDescription>
            {fieldError("deliveryDay")}
          </Field>
          <div className="grid gap-2">
            <SavedAddressPicker signedIn addresses={addresses} selectedId={addressId} onSelect={(id) => { setAddressId(id); setError(null) }} onAdd={() => setAddingAddress(true)} otherDetail="Type the address for your monthly delivery" />
            {chosen ? <>{fieldError("address")}{fieldError("pincode")}</> : null}
          </div>
          {!chosen ? (
            <>
              <Field>
                <FieldLabel htmlFor="mg-address">Delivery address</FieldLabel>
                <Textarea id="mg-address" autoComplete="street-address" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                {fieldError("address")}
              </Field>
              <Field>
                <FieldLabel htmlFor="mg-pin">Pincode</FieldLabel>
                <Input id="mg-pin" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })} />
                {fieldError("pincode")}
              </Field>
            </>
          ) : null}
          <Field>
            <FieldLabel htmlFor="mg-note">Note for the shop (optional)</FieldLabel>
            <Textarea id="mg-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </FieldGroup>
      </section>

      {/* 4. The bill */}
      <section className="mt-8 rounded-2xl border bg-card p-4" aria-labelledby="bill-title">
        <h2 id="bill-title" className="text-base font-semibold">Your monthly bill</h2>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Items</dt>
          <dd>{formatRupees(bill.subtotal)}</dd>
          {offer.enabled && offer.percentOff > 0 ? (
            <>
              <dt className="text-success">Monthly offer ({offer.percentOff}% off)</dt>
              <dd className="text-success">−{formatRupees(bill.discount)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Delivery</dt>
          <dd>{bill.deliveryFee === 0 ? "Free" : formatRupees(bill.deliveryFee)}</dd>
          <dt className="border-t pt-2 font-bold">Pay on delivery</dt>
          <dd className="border-t pt-2 font-bold">{formatRupees(bill.total)}</dd>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Prices can change a little between months. Your bill is always worked out on the day with the shop&apos;s current prices.</p>
      </section>

      {/* 5. Manage */}
      {plan ? (
        <section className="mt-8" aria-labelledby="manage-title">
          <h2 id="manage-title" className="text-base font-semibold">Manage</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {plan.status === "active" ? (
              <Button type="button" variant="outline" disabled={pending} onClick={() => changeStatus("paused")}>
                <HugeiconsIcon icon={PauseIcon} strokeWidth={2} data-icon="inline-start" />
                Pause deliveries
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={() => changeStatus("active")}>
                <HugeiconsIcon icon={PlayIcon} strokeWidth={2} data-icon="inline-start" />
                {locked ? "Start again" : "Resume"}
              </Button>
            )}
            {plan.status !== "cancelled" ? (
              <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => changeStatus("cancelled")}>
                Cancel monthly list
              </Button>
            ) : null}
          </div>
          {plan.history.length > 0 ? (
            <ul className="mt-4 divide-y overflow-hidden rounded-2xl border bg-card text-sm">
              {plan.history.map((h) => (
                <li key={h.code} className="flex items-center justify-between gap-3 p-3">
                  <span>
                    <span className="font-semibold">{h.month}</span>
                    <span className="block text-xs text-muted-foreground">Order {h.code} · {h.status.replaceAll("_", " ")}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold">{formatRupees(h.total)}</span>
                    {h.saved > 0 ? <span className="block text-xs text-success">saved {formatRupees(h.saved)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Save bar, above the phone's bottom navigation */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+var(--safe-area-inset-bottom,0px))] z-40 border-t bg-background/95 p-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold">{count} {count === 1 ? "item" : "items"} · {formatRupees(bill.total)}</p>
            <p className="truncate text-xs text-muted-foreground">{saved ? `Next delivery ${saved.next}` : `Deliver on the ${ordinal(Number(form.day))} of every month`}</p>
          </div>
          <Button type="button" size="lg" className="h-11 px-6" disabled={pending || count === 0} onClick={save}>
            {pending ? "Saving…" : plan ? "Save changes" : "Start monthly list"}
          </Button>
        </div>
      </div>

      <AddressFormDialog
        open={addingAddress}
        onOpenChange={setAddingAddress}
        editing={null}
        centre={centre}
        themeVars={themeVars}
        onSaved={(list, id) => {
          setAddresses(list)
          setAddressId(id)
        }}
      />
    </main>
  )
}
