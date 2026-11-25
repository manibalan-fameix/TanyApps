"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "@/lib/toast"
import { ArrowRight01Icon, Discount01Icon, Location01Icon, Restaurant01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { type DeliveryQuote, placeOrder, previewCoupon, previewDelivery } from "@/app/(tenant)/sites/[dealer]/actions"
import { BillDetails, BillRow, BillTotal } from "@/components/restaurant/bill-details"
import { useCart } from "@/components/restaurant/cart-provider"
import { AddressFormDialog } from "@/components/restaurant/store/address-form-dialog"
import { SavedAddressPicker } from "@/components/restaurant/store/saved-address-picker"
import { useGuestLocation } from "@/components/restaurant/store/location"
import { OrderBand } from "@/components/restaurant/store/order-band"
import { DishTile } from "@/components/restaurant/store/dish-tile"
import { payWithRazorpay } from "@/components/restaurant/store/razorpay"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { StoreDish } from "@/lib/restaurant/storefront"
import { MAX_TIP, gstOn } from "@/lib/restaurant/orders"
import { rememberOrder } from "@/lib/restaurant/recent-orders"
import type { SavedAddress } from "@/lib/restaurant/saved-address"
import { readFulfilmentPref, writeFulfilmentPref } from "@/components/restaurant/store/fulfilment-pref"
import { type Fulfilment, type OrderSettings, type PaymentMethod, enabledFulfilments } from "@/lib/restaurant/settings"
import { cn } from "@/lib/utils"

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

/** One white block of the checkout. On phones and tablets the blocks run edge to edge on a grey page, with no border or rounded corners; from tablet width up they get a hairline. */
const CARD = "bg-card p-4 -mx-3 sm:-mx-6 "
const TIP_CHOICES = [10, 20, 30] as const
const POPULAR_TIP = 20
const LABEL = "text-[13px] md:text-[15px] font-semibold tracking-[0.16em] text-muted-foreground uppercase"

export function CheckoutForm({ signedIn, savedAddresses, themeVars, settings, zonesEnabled, paymentMethods, testPayments, brandColor, dishes, canOrder, origin }: { signedIn: boolean; savedAddresses: SavedAddress[]; themeVars: React.CSSProperties; settings: OrderSettings; zonesEnabled: boolean; paymentMethods: PaymentMethod[]; testPayments: boolean; brandColor: string; dishes: StoreDish[]; canOrder: boolean; origin: { lat: number; lng: number } | null }) {
  const router = useRouter()
  const cart = useCart()
  const options = enabledFulfilments(settings)
  const [pending, start] = useTransition()
  const [fulfilment, setFulfilment] = useState<Fulfilment>(options[0] ?? "pickup")
  // Start on the Delivery / Pickup choice made on the home screen, when this restaurant still offers it.
  useEffect(() => {
    const saved = readFulfilmentPref()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved && options.includes(saved)) setFulfilment(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [pincode, setPincode] = useState("")
  // Saved addresses. With one selected, its line, pincode and pin are what is ordered to; the boxes below are only for "somewhere else".
  const [addresses, setAddresses] = useState(savedAddresses)
  const [addressId, setAddressId] = useState<string | null>(savedAddresses[0]?.id ?? null)
  const [addingAddress, setAddingAddress] = useState(false)
  const chosen = addresses.find((a) => a.id === addressId) ?? null
  const [payment, setPayment] = useState<PaymentMethod>(paymentMethods[0] ?? "cod")
  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const geo = useGuestLocation()
  const filledFromLocation = useRef(false)
  const [note, setNote] = useState("")
  // Tip for the delivery partner, in whole rupees. "other" opens a box for a custom amount.
  const [tipChoice, setTipChoice] = useState<number | "other">(0)
  const [tipOther, setTipOther] = useState("")
  const [code, setCode] = useState("")
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Whenever a new location arrives (saved from the first screen, found automatically below, or chosen with "Use my
  // current location"), fill in the pincode and address. An address the guest typed themselves is never overwritten.
  const applied = useRef("")
  const autoAddress = useRef("")
  useEffect(() => {
    const l = geo.location
    if (!l) return
    const key = `${l.lat ?? ""},${l.lng ?? ""},${l.pincode}`
    if (applied.current === key) return
    applied.current = key
    // The address we filled in last time. A different address in the box means the guest typed it, so it stays.
    const previous = autoAddress.current
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (l.address) setAddress((a) => (!a || a === previous ? l.address : a))
    autoAddress.current = l.address || previous
    if (l.pincode) setPincode(l.pincode)
    // Only when the location changes; later edits by the guest are left alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.location])

  // Picking the location automatically: on delivery, if we do not have a live GPS location yet, ask the phone once.
  // The browser shows its own permission prompt; if the guest has already blocked it, nothing pops up and the
  // location bar below explains how to allow it.
  const triedAuto = useRef(false)
  useEffect(() => {
    if (!geo.ready || fulfilment !== "delivery" || chosen || triedAuto.current) return
    if (geo.location && geo.location.source !== "pincode") return
    triedAuto.current = true
    void (async () => {
      try {
        const state = await navigator.permissions?.query({ name: "geolocation" })
        if (state?.state === "denied") return
      } catch {
        // Some browsers cannot report the permission; asking is still fine.
      }
      void geo.locate()
    })()
    // Once per visit to this page, when the saved location has been read and no saved address is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.ready, fulfilment, addressId])

  // Where this order is going. The phone's location or pinned spot only counts when it is the place in the address boxes:
  // no pincode typed, a spot the map had no pincode for, or the same pincode. The server checks it again.
  const spot = !chosen && geo.location && geo.location.lat !== null && geo.location.lng !== null && (!pincode || !geo.location.pincode || pincode === geo.location.pincode) ? { lat: geo.location.lat, lng: geo.location.lng } : null
  const destination = chosen ? { address: chosen.line, pincode: chosen.pincode, lat: chosen.lat as number | null, lng: chosen.lng as number | null } : { address, pincode, lat: spot?.lat ?? null, lng: spot?.lng ?? null }

  // The delivery charge for wherever the order is going now.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuote(null)
    setErrors((e) => ({ ...e, pincode: "" }))
    if (!zonesEnabled || destination.pincode.length !== 6) return
    let stale = false
    void previewDelivery(destination.pincode, destination.lat, destination.lng).then((res) => {
      if (stale) return
      if (res.ok) setQuote(res.quote)
      else setErrors((e) => ({ ...e, pincode: res.error }))
    })
    return () => {
      stale = true
    }
  }, [zonesEnabled, destination.pincode, destination.lat, destination.lng])

  if (cart.count === 0)
    return (
      <div className="grid gap-4 rounded-xl border p-6 text-center">
        <p className="text-sm md:text-base text-muted-foreground">Your cart is empty.</p>
        <Link href="/" className={cn(buttonVariants(), "mx-auto")}>
          Back to the menu
        </Link>
      </div>
    )

  const discount = coupon && cart.subtotal >= 0 ? coupon.discount : 0
  const free = settings.freeDeliveryAbove !== null && cart.subtotal - discount >= settings.freeDeliveryAbove
  const fee = fulfilment === "delivery" && !free ? (quote ? quote.fee : settings.deliveryFee) : 0
  const tipRaw = tipChoice === "other" ? Math.floor(Number(tipOther) || 0) : tipChoice
  const tip = fulfilment === "delivery" ? Math.max(0, Math.min(MAX_TIP, tipRaw)) : 0
  const gst = gstOn(cart.subtotal - discount, settings.gstPercent)
  const total = cart.subtotal - discount + fee + gst + tip
  // What the guest is saving on this order: the coupon, plus the delivery fee when it is waived.
  const feeWaived = fulfilment === "delivery" && free && settings.deliveryFee > 0
  // What the items were marked down from: for every cart line on offer (a "compare at" price above the selling price), the
  // difference times the quantity. Lines with portions have no single compare-at price, so they add nothing here.
  const dishById = new Map(dishes.map((d) => [d.id, d]))
  const offerSaved = cart.lines.reduce((sum, l) => {
    const d = dishById.get(l.itemId)
    return d && d.portions.length === 0 && d.compareAt !== null && d.compareAt > l.price ? sum + (d.compareAt - l.price) * l.qty : sum
  }, 0)
  const saved = offerSaved + discount + (feeWaived ? settings.deliveryFee : 0)
  const inCart = new Set(cart.lines.map((l) => l.itemId))
  const suggestions = dishes.filter((d) => d.isAvailable && !inCart.has(d.id)).sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured)).slice(0, 8)

  function applyCoupon() {
    setErrors((e) => ({ ...e, couponCode: "" }))
    start(async () => {
      const res = await previewCoupon(code, cart.subtotal)
      if (res.ok) {
        setCoupon({ code: code.trim().toUpperCase(), discount: res.discount })
        toast.success(`Coupon applied: you save ${rupees(res.discount)}`)
      } else {
        setCoupon(null)
        setErrors((e) => ({ ...e, couponCode: res.error }))
      }
    })
  }

  function submit() {
    setErrors({})
    start(async () => {
      const res = await placeOrder({
        name,
        phone,
        fulfilment,
        paymentMethod: payment,
        address: destination.address,
        pincode: destination.pincode,
        latitude: fulfilment === "delivery" ? destination.lat : null,
        longitude: fulfilment === "delivery" ? destination.lng : null,
        note,
        couponCode: coupon?.code ?? "",
        tip,
        lines: cart.lines.map((l) => ({ itemId: l.itemId, portion: l.portion, qty: l.qty })),
      })
      if (!res.ok) {
        setErrors({ [res.field || "form"]: res.error })
        if (!res.field) toast.error(res.error)
        return
      }
      // The order exists from here on. The cart is cleared only after the payment window closes, so the page behind it does not change.
      rememberOrder(res.code)
      if (res.checkout) {
        const out = await payWithRazorpay(res.checkout, { color: brandColor, name, phone: `+91${phone.replace(/\D/g, "").slice(-10)}` })
        if (out.status === "error") toast.error(out.message)
        else if (out.status === "done") toast.success("Payment received. Thank you!")
      }
      cart.clear()
      // An unpaid order lands on its page, which offers Pay now or Cancel.
      router.push(`/o/${res.code}`)
    })
  }

  return (
    // On phones the whole page is a grey canvas of white blocks, like the home screen; from large screens it becomes two columns.
    <div className="-mx-4 flex flex-col gap-3 bg-muted px-3 py-3 sm:-mx-6 sm:px-6 ">
      <OrderBand
        options={options}
        fulfilment={fulfilment}
        onPick={(m) => {
          setFulfilment(m)
          writeFulfilmentPref(m)
        }}
        origin={origin}
        zoneEta={quote?.etaMinutes ?? null}
        error={errors.fulfilment}
      />

      <div className="contents ">
        <section className={cn(CARD, "grid gap-5 order-3")} aria-labelledby="co-details">
          <h2 id="co-details" className={LABEL}>Your details</h2>
          <FieldGroup>
            {fulfilment === "delivery" ? (
              <div className="grid gap-2">
                <SavedAddressPicker signedIn={signedIn} addresses={addresses} selectedId={addressId} onSelect={(id) => { setAddressId(id); setErrors((e) => ({ ...e, address: "", pincode: "" })) }} onAdd={() => setAddingAddress(true)} />
                {chosen && (errors.address || errors.pincode) ? <p role="alert" className="text-sm md:text-base text-destructive">{errors.address || errors.pincode}</p> : null}
                {chosen && quote ? <p className="text-sm text-muted-foreground">Delivering to {quote.zoneName}{quote.etaMinutes ? ` · about ${quote.etaMinutes} min` : ""}{quote.minOrder ? ` · minimum order ₹${quote.minOrder}` : ""}</p> : null}
              </div>
            ) : null}
            {fulfilment === "delivery" && !chosen ? (
              <>
                {/* Where it is going, like the address bar on a delivery app: place in bold, street below, Change on the right. */}
                <button type="button" disabled={geo.status !== "idle"} onClick={() => geo.setPickerOpen(true)} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 text-left">
                  <HugeiconsIcon icon={Location01Icon} strokeWidth={2} className="size-6 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm md:text-base font-bold">
                      {geo.status !== "idle" ? "Finding your location…" : geo.location ? (geo.location.source === "gps" ? "Using your live location" : geo.location.source === "map" ? "Your pinned spot" : "Delivering to your pincode") : "Choose where to deliver"}
                    </span>
                    <span className="block truncate text-xs md:text-sm text-muted-foreground">{geo.location ? ([geo.location.area, geo.location.pincode].filter(Boolean).join(" · ") || "Saved on this device") : "Share your live location or pick a spot on the map"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 text-sm md:text-base font-bold text-info">
                    {geo.location ? "Change" : "Choose"}
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
                  </span>
                </button>
                {geo.error ? <p role="alert" className="text-sm md:text-base text-destructive">{geo.error}</p> : null}
              </>
            ) : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="co-name">Your name</FieldLabel>
                <Input id="co-name" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(errors.phone)}>
                <FieldLabel htmlFor="co-phone">Mobile number</FieldLabel>
                <Input id="co-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {errors.phone ? <FieldError>{errors.phone}</FieldError> : null}
              </Field>
            </div>
            {fulfilment === "delivery" && !chosen ? (
              <>
                <Field data-invalid={Boolean(errors.address)}>
                  <FieldLabel htmlFor="co-address">Delivery address</FieldLabel>
                  <Textarea id="co-address" rows={3} value={address} autoComplete="street-address" onChange={(e) => setAddress(e.target.value)} />
                  {errors.address ? <FieldError>{errors.address}</FieldError> : null}
                </Field>
                <Field data-invalid={Boolean(errors.pincode)} className="sm:max-w-xs">
                  <FieldLabel htmlFor="co-pincode">Pincode</FieldLabel>
                  <Input id="co-pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))} />
                  {errors.pincode ? <FieldError>{errors.pincode}</FieldError> : null}
                  {quote ? <FieldDescription>Delivering to {quote.zoneName}{quote.etaMinutes ? ` · about ${quote.etaMinutes} min` : ""}{quote.minOrder ? ` · minimum order ₹${quote.minOrder}` : ""}</FieldDescription> : null}
                </Field>
              </>
            ) : null}
            <Field>
              <FieldLabel htmlFor="co-note">Note for the kitchen (optional)</FieldLabel>
              <Textarea id="co-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </FieldGroup>
        </section>
      </div>

      {/* The order: items, things to add, coupon, bill and payment. First on phones, right column on large screens. */}
      <div className="contents ">
        <section className={cn(CARD, "grid gap-3 order-1")}>
          <h2 id="co-summary" className={LABEL}>Your order</h2>
          <ul className="divide-y">
            {cart.lines.map((l) => (
              <li key={`${l.itemId}:${l.portion}`} className="flex items-center gap-2.5 py-3 first:pt-0 last:pb-0">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {dishById.get(l.itemId)?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dishById.get(l.itemId)!.imageUrl!} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground/50">
                      <HugeiconsIcon icon={Restaurant01Icon} strokeWidth={1.5} className="size-6" />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm md:text-base leading-snug font-bold">{l.name}</p>
                  {l.portion ? <p className="text-sm md:text-base text-muted-foreground">{l.portion}</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {/* Quantity pill, the same look as the ADD control on the menu. */}
                  <div className="flex h-8 shrink-0 items-center rounded-lg border border-info bg-info/5 text-info">
                    <button type="button" aria-label={`Remove one ${l.name}`} onClick={() => cart.setQty(l.itemId, l.portion, l.qty - 1)} className="grid size-8 place-items-center text-lg md:text-xl font-semibold">−</button>
                    <span className="w-5 text-center text-sm md:text-base font-semibold">{l.qty}</span>
                    <button type="button" aria-label={`Add one ${l.name}`} onClick={() => cart.setQty(l.itemId, l.portion, l.qty + 1)} className="grid size-8 place-items-center text-lg md:text-xl font-semibold">+</button>
                  </div>
                  <p className="flex shrink-0 items-baseline justify-end gap-1.5 text-base md:text-lg font-semibold">
                    {(() => {
                      const d = dishById.get(l.itemId)
                      return d && d.portions.length === 0 && d.compareAt !== null && d.compareAt > l.price ? <span className="text-sm md:text-base font-normal text-muted-foreground line-through">{rupees(d.compareAt * l.qty)}</span> : null
                    })()}
                    {rupees(l.price * l.qty)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {suggestions.length > 0 ? (
          <section className={cn(CARD, "grid gap-3 order-2")} aria-label="You might also like">
            <h2 className={LABEL}>You might also like</h2>
            <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {suggestions.map((d) => (
                <li key={d.id} className="w-28 shrink-0 snap-start">
                  <DishTile dish={d} canOrder={canOrder} badge />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {fulfilment === "delivery" ? (
          <section className={cn(CARD, "grid gap-3 order-4")} aria-labelledby="co-tip">
            <h2 id="co-tip" className={LABEL}>Delivery tip</h2>
            <p className="text-sm md:text-base text-muted-foreground">A small tip, a big gesture! Show your appreciation to your delivery partner for their hard work.</p>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Delivery tip">
              {TIP_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={tipChoice === n}
                  onClick={() => setTipChoice(tipChoice === n ? 0 : n)}
                  className="relative flex h-12 items-center justify-center overflow-hidden rounded-xl border text-sm md:text-base font-bold transition-colors aria-checked:border-info aria-checked:bg-info/5 aria-checked:text-info"
                >
                  {rupees(n)}
                  {n === POPULAR_TIP ? <span className="absolute inset-x-0 bottom-0 bg-info py-px text-center text-[10px] md:text-xs leading-3.5 font-semibold text-background">Most tipped</span> : null}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={tipChoice === "other"}
                onClick={() => setTipChoice(tipChoice === "other" ? 0 : "other")}
                className="flex h-12 items-center justify-center rounded-xl border text-sm md:text-base font-bold transition-colors aria-checked:border-info aria-checked:bg-info/5 aria-checked:text-info"
              >
                Other
              </button>
            </div>
            {tipChoice === "other" ? (
              <Field>
                <FieldLabel htmlFor="co-tip-other">Your tip in rupees (up to {rupees(MAX_TIP)})</FieldLabel>
                <Input id="co-tip-other" inputMode="numeric" autoFocus value={tipOther} onChange={(e) => setTipOther(e.target.value.replace(/\D/g, "").slice(0, 3))} />
              </Field>
            ) : null}
            {tip > 0 ? <p className="text-sm md:text-base text-success">Thank you! {rupees(tip)} goes to your delivery partner.</p> : null}
          </section>
        ) : null}

        <section className={cn(CARD, "grid gap-3 order-5")}>
          <Field data-invalid={Boolean(errors.couponCode)}>
            <FieldLabel htmlFor="co-coupon">Coupon code</FieldLabel>
            <div className="flex gap-2">
              <Input id="co-coupon" value={code} autoCapitalize="characters" onChange={(e) => { setCode(e.target.value); setCoupon(null) }} />
              <Button type="button" variant="outline" disabled={pending || !code.trim()} onClick={applyCoupon}>
                Apply
              </Button>
            </div>
            {errors.couponCode ? <FieldError>{errors.couponCode}</FieldError> : null}
          </Field>
        </section>

        <BillDetails id="co-bill" className={cn(CARD, "order-6")}>
            <BillRow label="Item total" value={<>{offerSaved > 0 ? <span className="mr-1.5 text-muted-foreground line-through">{rupees(cart.subtotal + offerSaved)}</span> : null}{rupees(cart.subtotal)}</>} />
            {discount > 0 ? <BillRow label={`Coupon ${coupon?.code}`} value={`−${rupees(discount)}`} tone="success" /> : null}
            {gst > 0 ? <BillRow label={`GST (${settings.gstPercent}%)`} value={rupees(gst)} /> : null}
            {fulfilment === "delivery" ? (
              <BillRow
                label="Delivery partner tip"
                value={tip > 0 ? rupees(tip) : <button type="button" onClick={() => document.getElementById("co-tip")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="font-semibold text-info">Add a tip</button>}
              />
            ) : null}
            {fulfilment === "delivery" ? (
              <BillRow
                label="Delivery fee"
                value={fee === 0 ? <>{settings.deliveryFee > 0 ? <span className="mr-1.5 text-muted-foreground line-through">{rupees(settings.deliveryFee)}</span> : null}<span className="font-semibold text-success">FREE</span></> : rupees(fee)}
              />
            ) : null}
            <BillTotal>{saved > 0 ? <span className="mr-2 text-[13px] md:text-[15px] font-normal text-muted-foreground line-through">{rupees(total + saved)}</span> : null}{rupees(total)}</BillTotal>
        </BillDetails>

        {paymentMethods.length > 1 ? (
          <section id="co-payment" className={cn(CARD, "grid gap-2 scroll-mt-20 order-7")} role="radiogroup" aria-label="How would you like to pay?">
            <h2 className={LABEL}>How would you like to pay?</h2>
            {paymentMethods.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={payment === m}
                onClick={() => setPayment(m)}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left text-sm md:text-base transition-colors hover:bg-muted/50 ${payment === m ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}
              >
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-2 font-bold">
                    {m === "online" ? "Pay online" : fulfilment === "delivery" ? "Cash on delivery" : "Pay at the restaurant"}
                    {m === "online" ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] md:text-xs font-semibold text-primary">Recommended</span> : null}
                  </span>
                  <span className="text-xs md:text-sm text-muted-foreground">{m === "online" ? "UPI, cards and netbanking, securely through Razorpay." : "Pay with cash or UPI when you receive your order."}</span>
                </span>
              </button>
            ))}
          </section>
        ) : null}

        {testPayments && payment === "online" ? (
          <div role="note" className="grid gap-1 w-full rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-3.5 text-[13px] md:text-[15px] order-8 ">
            <p className="font-medium">Test mode: no real money is charged</p>
            <p className="text-muted-foreground">
              In the payment window choose <strong>Netbanking</strong>, pick any bank, then press <strong>Success</strong> on the demo bank page. To test a card
              instead, use <span className="font-mono">5267 3181 8797 5449</span> with any future expiry and any CVV. Razorpay may also ask for an email address.
            </p>
          </div>
        ) : null}


        {errors.form ? <p role="alert" className="w-full text-sm md:text-base text-destructive order-10 ">{errors.form}</p> : null}

        {/* On phones this is a sheet pinned to the bottom: how you pay, then the big button with the total. On large screens it sits at the end of the column. */}
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto grid max-w-4xl gap-2 rounded-t-3xl  bg-card px-4 pt-3 pb-[calc(0.75rem+var(--safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgb(0_0_0/0.08)] ">
          <div role="note" className="flex items-center justify-center gap-2 rounded-xl bg-success/10 px-4 py-2.5 text-sm md:text-base text-success">
            <HugeiconsIcon icon={Discount01Icon} strokeWidth={2} className="size-4 shrink-0" />
            {saved > 0 ? (
              <span>
                <span className="opacity-80">You saved </span>
                <span className="font-bold">{rupees(saved)}</span>
                <span className="opacity-80"> on this order</span>
              </span>
            ) : (
              <span>
                <span className="opacity-80">You saved </span>
                <span className="font-bold">{rupees(0)}</span>
                <span className="opacity-80"> so far. Add a coupon to save</span>
              </span>
            )}
          </div>
          <Button type="button" size="lg" disabled={pending} onClick={submit} className="h-14 rounded-full bg-info text-lg md:text-xl font-semibold text-background hover:bg-info/90">
            {pending ? (payment === "online" ? "Opening payment..." : "Placing order...") : payment === "online" ? `Pay | ${rupees(total)}` : `Place order | ${rupees(total)}`}
          </Button>
        </div>
      </div>

      <AddressFormDialog
        open={addingAddress}
        onOpenChange={setAddingAddress}
        editing={null}
        centre={origin}
        themeVars={themeVars}
        onSaved={(list, id) => {
          setAddresses(list)
          setAddressId(id)
        }}
      />
    </div>
  )
}
