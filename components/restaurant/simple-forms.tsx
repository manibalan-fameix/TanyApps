"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { createBanner, createCoupon, saveOrderSettings, saveProfile } from "@/lib/restaurant/admin-actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { PromoBanner } from "@/components/restaurant/store/promo-banners"
import { BANNER_TONES, BANNER_TONE_LABEL, type BannerTone } from "@/lib/restaurant/banners"
import { ImageUpload } from "@/components/restaurant/image-upload"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { RestaurantProfile } from "@/lib/restaurant/profile"
import type { OrderSettings } from "@/lib/restaurant/settings"
import { Textarea } from "@/components/ui/textarea"

const digits = (v: string) => v.replace(/\D/g, "")
const KINDS = [
  { value: "percent", label: "Percentage off" },
  { value: "flat", label: "Flat ₹ off" },
]

export function CouponForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [code, setCode] = useState("")
  const [kind, setKind] = useState("percent")
  const [value, setValue] = useState("")
  const [minOrder, setMinOrder] = useState("")
  const [maxDiscount, setMaxDiscount] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="cp-code">Code</FieldLabel>
        <Input id="cp-code" value={code} placeholder="WELCOME10" autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </Field>
      <Field>
        <FieldLabel>Type</FieldLabel>
        <Select items={KINDS} value={kind} onValueChange={(v) => setKind(String(v))}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="cp-value">{kind === "percent" ? "Percentage" : "Amount (₹)"}</FieldLabel>
        <Input id="cp-value" inputMode="numeric" value={value} onChange={(e) => setValue(digits(e.target.value))} />
      </Field>
      <Field>
        <FieldLabel htmlFor="cp-min">Minimum order (₹, optional)</FieldLabel>
        <Input id="cp-min" inputMode="numeric" value={minOrder} onChange={(e) => setMinOrder(digits(e.target.value))} />
      </Field>
      {kind === "percent" ? (
        <Field>
          <FieldLabel htmlFor="cp-max">Maximum discount (₹, optional)</FieldLabel>
          <Input id="cp-max" inputMode="numeric" value={maxDiscount} onChange={(e) => setMaxDiscount(digits(e.target.value))} />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor="cp-exp">Valid until (optional)</FieldLabel>
        <Input id="cp-exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </Field>
      <Button
        type="button"
        disabled={pending}
        className="w-fit"
        onClick={() =>
          start(async () => {
            const res = await createCoupon({
              code,
              kind,
              value: Number(value),
              minOrder: Number(minOrder || 0),
              maxDiscount: maxDiscount ? Number(maxDiscount) : null,
              expiresAt: expiresAt || null,
            })
            if (res.ok) {
              toast.success("Coupon created.")
              onDone?.()
              setCode(""); setValue(""); setMinOrder(""); setMaxDiscount(""); setExpiresAt("")
              router.refresh()
            } else toast.error(res.error)
          })
        }
      >
        Create coupon
      </Button>
    </FieldGroup>
  )
}

export type BannerDestination = { value: string; label: string }
const CUSTOM_LINK = "__custom"
const NO_LINK = "__none"

/** A short banner: title, one line of text, a button and where it goes, a background look and a picture for the right side. */
export function BannerForm({ onDone, destinations }: { onDone?: () => void; destinations: BannerDestination[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const empty = { title: "", subtitle: "", buttonLabel: "", dest: NO_LINK, custom: "", tone: "soft" as BannerTone, imageUrl: "" }
  const [v, setV] = useState(empty)
  const options = [{ value: NO_LINK, label: "Nowhere (just a message)" }, ...destinations, { value: CUSTOM_LINK, label: "A web link…" }]
  const toneItems = BANNER_TONES.map((t) => ({ value: t, label: BANNER_TONE_LABEL[t] }))
  const linkUrl = v.dest === NO_LINK ? "" : v.dest === CUSTOM_LINK ? v.custom : v.dest
  return (
    <FieldGroup>
      <div className="pointer-events-none" aria-hidden="true">
        <p className="mb-1.5 text-xs text-muted-foreground">Preview</p>
        <PromoBanner banner={{ title: v.title || "Your offer title", subtitle: v.subtitle || "A short line about the offer.", buttonLabel: v.buttonLabel, linkUrl: linkUrl || (v.buttonLabel ? "/" : ""), tone: v.tone, imageUrl: v.imageUrl || null }} />
      </div>
      <Field>
        <FieldLabel htmlFor="bn-title">Title</FieldLabel>
        <Input id="bn-title" value={v.title} maxLength={50} placeholder="Get ₹100 off orders above ₹500" onChange={(e) => setV({ ...v, title: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="bn-sub">Description (optional)</FieldLabel>
        <Input id="bn-sub" value={v.subtitle} maxLength={90} placeholder="Use code SOUTH20 at checkout" onChange={(e) => setV({ ...v, subtitle: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="bn-btn">Button text (optional)</FieldLabel>
        <Input id="bn-btn" value={v.buttonLabel} maxLength={20} placeholder="Order now" onChange={(e) => setV({ ...v, buttonLabel: e.target.value })} />
      </Field>
      <Field>
        <FieldLabel>Where the banner takes guests</FieldLabel>
        <Select items={options} value={v.dest} onValueChange={(d) => setV({ ...v, dest: String(d) })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      {v.dest === CUSTOM_LINK ? (
        <Field>
          <FieldLabel htmlFor="bn-link">Web link</FieldLabel>
          <Input id="bn-link" value={v.custom} inputMode="url" placeholder="https://" onChange={(e) => setV({ ...v, custom: e.target.value })} />
          <FieldDescription>Must start with https://. Opens in a new tab.</FieldDescription>
        </Field>
      ) : null}
      <Field>
        <FieldLabel>Background</FieldLabel>
        <Select items={toneItems} value={v.tone} onValueChange={(t) => setV({ ...v, tone: t as BannerTone })}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>{toneItems.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Picture for the right side (optional)</FieldLabel>
        <ImageUpload kind="banner" label="image" value={v.imageUrl} onChange={(imageUrl) => setV({ ...v, imageUrl })} />
      </Field>
      <Button
        type="button"
        disabled={pending}
        className="w-fit"
        onClick={() =>
          start(async () => {
            const res = await createBanner({ title: v.title, subtitle: v.subtitle, buttonLabel: v.buttonLabel, linkUrl, tone: v.tone, imageUrl: v.imageUrl })
            if (res.ok) {
              toast.success("Banner added.")
              onDone?.()
              setV(empty)
              router.refresh()
            } else toast.error(res.error)
          })
        }
      >
        Add banner
      </Button>
    </FieldGroup>
  )
}

export function OrderSettingsForm({ initial, disabled, onlineReady }: { initial: OrderSettings; disabled: boolean; onlineReady: boolean }) {
  const [pending, start] = useTransition()
  const [s, setS] = useState({
    ...initial,
    deliveryFee: String(initial.deliveryFee),
    minOrder: String(initial.minOrder),
    freeDeliveryAbove: initial.freeDeliveryAbove === null ? "" : String(initial.freeDeliveryAbove),
  })
  const flag = (key: "acceptingOrders" | "delivery" | "pickup" | "dineIn" | "acceptCod" | "acceptOnline", label: string, help?: string) => (
    <Field orientation="horizontal">
      <Checkbox id={`os-${key}`} checked={s[key]} disabled={disabled} onCheckedChange={(v) => setS({ ...s, [key]: Boolean(v) })} />
      <div className="grid gap-0.5">
        <FieldLabel htmlFor={`os-${key}`}>{label}</FieldLabel>
        {help ? <FieldDescription>{help}</FieldDescription> : null}
      </div>
    </Field>
  )
  return (
    <FieldGroup className="max-w-md">
      {flag("acceptingOrders", "Accepting online orders", "Turn off when the kitchen is closed. Guests can still see the menu and call.")}
      {flag("delivery", "Delivery")}
      {flag("pickup", "Pickup")}
      {flag("dineIn", "Dine in (order from the table)")}
      {flag("acceptCod", "Accept cash on delivery or at the restaurant")}
      {flag("acceptOnline", "Accept online payment", onlineReady ? "Guests pay with UPI, card or netbanking. The money goes straight to your bank account." : "Not available yet. Connect your bank account under Settings → Payments first.")}
      <Field>
        <FieldLabel htmlFor="os-fee">Delivery fee (₹)</FieldLabel>
        <Input id="os-fee" inputMode="numeric" disabled={disabled} value={s.deliveryFee} onChange={(e) => setS({ ...s, deliveryFee: digits(e.target.value) })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="os-free">Free delivery above (₹, optional)</FieldLabel>
        <Input id="os-free" inputMode="numeric" disabled={disabled} value={s.freeDeliveryAbove} onChange={(e) => setS({ ...s, freeDeliveryAbove: digits(e.target.value) })} />
      </Field>
      <Field>
        <FieldLabel htmlFor="os-min">Minimum order (₹)</FieldLabel>
        <Input id="os-min" inputMode="numeric" disabled={disabled} value={s.minOrder} onChange={(e) => setS({ ...s, minOrder: digits(e.target.value) })} />
      </Field>
      <Button
        type="button"
        className="w-fit"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const res = await saveOrderSettings({
              ...s,
              deliveryFee: Number(s.deliveryFee || 0),
              minOrder: Number(s.minOrder || 0),
              freeDeliveryAbove: s.freeDeliveryAbove ? Number(s.freeDeliveryAbove) : null,
            })
            if (res.ok) toast.success("Ordering settings saved.")
            else toast.error(res.error)
          })
        }
      >
        Save settings
      </Button>
    </FieldGroup>
  )
}

export function ProfileForm({ initial, disabled }: { initial: RestaurantProfile; disabled: boolean }) {
  const [pending, start] = useTransition()
  const [p, setP] = useState(initial)
  const text = (key: keyof RestaurantProfile, label: string, props: { placeholder?: string; help?: string; area?: boolean } = {}) => (
    <Field>
      <FieldLabel htmlFor={`pf-${key}`}>{label}</FieldLabel>
      {props.area ? (
        <Textarea id={`pf-${key}`} rows={5} disabled={disabled} value={p[key]} placeholder={props.placeholder} onChange={(e) => setP({ ...p, [key]: e.target.value })} />
      ) : (
        <Input id={`pf-${key}`} disabled={disabled} value={p[key]} placeholder={props.placeholder} onChange={(e) => setP({ ...p, [key]: e.target.value })} />
      )}
      {props.help ? <FieldDescription>{props.help}</FieldDescription> : null}
    </Field>
  )
  return (
    <FieldGroup className="max-w-xl">
      {text("tagline", "Tagline", { placeholder: "Authentic Chettinad cooking since 1998", help: "One line shown on your home page." })}
      {text("about", "Our story", { area: true, placeholder: "Tell guests who you are, what you cook and what makes it special.", help: "Shown on your home page and the Our Story page." })}
      {text("address", "Address", { placeholder: "12 Main Road, T. Nagar, Chennai" })}
      {text("email", "Email", { placeholder: "hello@yourrestaurant.com" })}
      {text("whatsapp", "WhatsApp number", { placeholder: "98765 43210", help: "Guests can message you from your page." })}
      <Button
        type="button"
        className="w-fit"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            const res = await saveProfile(p)
            if (res.ok) toast.success("Storefront saved.")
            else toast.error(res.error)
          })
        }
      >
        Save storefront
      </Button>
    </FieldGroup>
  )
}
