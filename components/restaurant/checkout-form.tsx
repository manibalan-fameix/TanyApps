"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { type DeliveryQuote, placeOrder, previewCoupon, previewDelivery } from "@/app/(tenant)/sites/[dealer]/actions"
import { useCart } from "@/components/restaurant/cart-provider"
import { useGuestLocation } from "@/components/restaurant/store/location"
import { payWithRazorpay } from "@/components/restaurant/store/razorpay"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { rememberOrder } from "@/lib/restaurant/recent-orders"
import { type Fulfilment, FULFILMENT_LABEL, type OrderSettings, type PaymentMethod, enabledFulfilments } from "@/lib/restaurant/settings"
import { cn } from "@/lib/utils"

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

export function CheckoutForm({ settings, zonesEnabled, paymentMethods, testPayments, brandColor }: { settings: OrderSettings; zonesEnabled: boolean; paymentMethods: PaymentMethod[]; testPayments: boolean; brandColor: string }) {
  const router = useRouter()
  const cart = useCart()
  const options = enabledFulfilments(settings)
  const [pending, start] = useTransition()
  const [fulfilment, setFulfilment] = useState<Fulfilment>(options[0] ?? "pickup")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [pincode, setPincode] = useState("")
  const [payment, setPayment] = useState<PaymentMethod>(paymentMethods[0] ?? "cod")
  const [quote, setQuote] = useState<DeliveryQuote | null>(null)
  const geo = useGuestLocation()
  const filledFromLocation = useRef(false)
  const [note, setNote] = useState("")
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
    if (l.pincode) onPincode(l.pincode)
    // Only when the location changes; later edits by the guest are left alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.location])

  // Picking the location automatically: on delivery, if we do not have a live GPS location yet, ask the phone once.
  // The browser shows its own permission prompt; if the guest has already blocked it, nothing pops up and the
  // location bar below explains how to allow it.
  const triedAuto = useRef(false)
  useEffect(() => {
    if (!geo.ready || fulfilment !== "delivery" || triedAuto.current) return
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
    // Once per visit to this page, when the saved location has been read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.ready, fulfilment])

  if (cart.count === 0)
    return (
      <div className="grid gap-4 rounded-xl border p-6 text-center">
        <p className="text-sm text-muted-foreground">Your cart is empty.</p>
        <Link href="/" className={cn(buttonVariants(), "mx-auto")}>
          Back to the menu
        </Link>
      </div>
    )

  const discount = coupon && cart.subtotal >= 0 ? coupon.discount : 0
  const free = settings.freeDeliveryAbove !== null && cart.subtotal - discount >= settings.freeDeliveryAbove
  const fee = fulfilment === "delivery" && !free ? (quote ? quote.fee : settings.deliveryFee) : 0
  const total = cart.subtotal - discount + fee

  function onPincode(value: string) {
    setPincode(value)
    setQuote(null)
    setErrors((e) => ({ ...e, pincode: "" }))
    if (!zonesEnabled || value.length !== 6) return
    const here = geo.location && geo.location.pincode === value && geo.location.lat !== null ? geo.location : null
    previewDelivery(value, here?.lat ?? null, here?.lng ?? null).then((res) => {
      if (res.ok) setQuote(res.quote)
      else setErrors((e) => ({ ...e, pincode: res.error }))
    })
  }

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
        address,
        pincode,
        // Only sent when it is the place they are ordering to: no pincode typed, or the pincode of that location.
        latitude: fulfilment === "delivery" && (!pincode || pincode === geo.location?.pincode) ? (geo.location?.lat ?? null) : null,
        longitude: fulfilment === "delivery" && (!pincode || pincode === geo.location?.pincode) ? (geo.location?.lng ?? null) : null,
        note,
        couponCode: coupon?.code ?? "",
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
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
      {/* Left: who the order is for and where it goes. */}
      <section className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="co-details">
        <h2 id="co-details" className="text-lg font-semibold tracking-tight">Your details</h2>
        <FieldGroup>
          <Field>
            <FieldLabel>How would you like it?</FieldLabel>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Order type">
              {options.map((f) => (
                <Button key={f} type="button" role="radio" aria-checked={fulfilment === f} variant={fulfilment === f ? "default" : "outline"} size="sm" onClick={() => setFulfilment(f)}>
                  {FULFILMENT_LABEL[f]}
                </Button>
              ))}
            </div>
            {errors.fulfilment ? <FieldError>{errors.fulfilment}</FieldError> : null}
          </Field>
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
          {fulfilment === "delivery" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
                {geo.location ? (
                  <span>
                    <span className="font-medium">{geo.location.source === "gps" ? "Using your live location" : geo.location.source === "map" ? "Delivering to your pinned spot" : "Delivering to pincode"}</span>
                    <span className="text-muted-foreground"> · {[geo.location.area, geo.location.pincode].filter(Boolean).join(" · ") || "saved on this device"}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{geo.status === "idle" ? "Share your live location to fill in your address and pincode." : "Finding your location…"}</span>
                )}
                {/* Opens the map: search, drag the pin, or use the phone's location. */}
                <Button type="button" size="sm" variant="outline" disabled={geo.status !== "idle"} onClick={() => geo.setPickerOpen(true)}>
                  {geo.status !== "idle" ? "Locating…" : geo.location ? "Update location" : "Choose location"}
                </Button>
              </div>
              {geo.error ? <p role="alert" className="text-sm text-destructive">{geo.error}</p> : null}
              <Field data-invalid={Boolean(errors.address)}>
                <FieldLabel htmlFor="co-address">Delivery address</FieldLabel>
                <Textarea id="co-address" rows={3} value={address} autoComplete="street-address" onChange={(e) => setAddress(e.target.value)} />
                {errors.address ? <FieldError>{errors.address}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(errors.pincode)} className="sm:max-w-xs">
                <FieldLabel htmlFor="co-pincode">Pincode</FieldLabel>
                <Input id="co-pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={pincode} onChange={(e) => onPincode(e.target.value.replace(/\D/g, ""))} />
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

      {/* Right: the order, coupon, payment and total. Stays in view while the left side is filled in. */}
      <aside className="grid gap-5 rounded-2xl border bg-card p-5 sm:p-6 lg:sticky lg:top-24" aria-labelledby="co-summary">
        <h2 id="co-summary" className="text-lg font-semibold tracking-tight">Your order</h2>
        <ul className="divide-y rounded-xl border">
          {cart.lines.map((l) => (
            <li key={`${l.itemId}:${l.portion}`} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  {l.portion ? `${l.portion} · ` : ""}
                  {rupees(l.price)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button type="button" size="icon-sm" variant="outline" aria-label={`Remove one ${l.name}`} onClick={() => cart.setQty(l.itemId, l.portion, l.qty - 1)}>
                  −
                </Button>
                <span className="w-5 text-center text-sm">{l.qty}</span>
                <Button type="button" size="icon-sm" variant="outline" aria-label={`Add one ${l.name}`} onClick={() => cart.setQty(l.itemId, l.portion, l.qty + 1)}>
                  +
                </Button>
              </div>
              <p className="w-16 text-right text-sm font-medium">{rupees(l.price * l.qty)}</p>
            </li>
          ))}
        </ul>

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

        {paymentMethods.length > 1 ? (
          <div className="grid gap-2" role="radiogroup" aria-label="How would you like to pay?">
            <p className="text-sm font-medium">How would you like to pay?</p>
            {paymentMethods.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={payment === m}
                onClick={() => setPayment(m)}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:bg-muted/50 ${payment === m ? "border-primary bg-primary/5 ring-1 ring-primary" : ""}`}
              >
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-2 font-medium">
                    {m === "online" ? "Pay online" : fulfilment === "delivery" ? "Cash on delivery" : "Pay at the restaurant"}
                    {m === "online" ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Recommended</span> : null}
                  </span>
                  <span className="text-muted-foreground">{m === "online" ? "UPI, cards and netbanking, securely through Razorpay." : "Pay with cash or UPI when you receive your order."}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {testPayments && payment === "online" ? (
          <div role="note" className="grid gap-1 rounded-xl border border-dashed border-primary/50 bg-primary/5 p-3 text-xs">
            <p className="font-medium">Test mode: no real money is charged</p>
            <p className="text-muted-foreground">
              In the payment window choose <strong>Netbanking</strong>, pick any bank, then press <strong>Success</strong> on the demo bank page. To test a card
              instead, use <span className="font-mono">5267 3181 8797 5449</span> with any future expiry and any CVV. Razorpay may also ask for an email address.
            </p>
          </div>
        ) : null}

        <dl className="grid gap-1 border-t pt-4 text-sm">
          <div className="flex justify-between"><dt>Items</dt><dd>{rupees(cart.subtotal)}</dd></div>
          {discount > 0 ? <div className="flex justify-between text-success"><dt>Coupon {coupon?.code}</dt><dd>−{rupees(discount)}</dd></div> : null}
          {fulfilment === "delivery" ? <div className="flex justify-between"><dt>Delivery</dt><dd>{fee === 0 ? "Free" : rupees(fee)}</dd></div> : null}
          <div className="flex justify-between border-t pt-2 text-base font-semibold"><dt>Total</dt><dd>{rupees(total)}</dd></div>
          <p className="pt-1 text-xs text-muted-foreground">{payment === "online" ? "You will pay in the next step. Your order is held for 20 minutes while you pay." : "Pay when you receive your order. The restaurant confirms it by phone if needed."}</p>
        </dl>

        {errors.form ? <p role="alert" className="text-sm text-destructive">{errors.form}</p> : null}
        <Button type="button" size="lg" disabled={pending} onClick={submit}>
          {pending ? (payment === "online" ? "Opening payment..." : "Placing order...") : payment === "online" ? `Pay ${rupees(total)}` : `Place order · ${rupees(total)}`}
        </Button>
      </aside>
    </div>
  )
}
