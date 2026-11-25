"use client"

import { ImageUpload01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"

import { saveBusinessDetails, verifyBusinessPhone } from "@/app/(admin)/(shell)/settings/actions"
import { PhoneVerify } from "@/components/onboarding/phone-verify"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FirebaseWebConfig } from "@/lib/firebase/client"
import { resizeToPng } from "@/lib/image/resize"
import { toast } from "@/lib/toast"
import type { IndustryKey } from "@/lib/verticals/keys"
import { retailTypeList, type RetailTypeKey } from "@/lib/verticals/retail-types"

export type BusinessDetails = {
  displayName: string
  city: string
  /** 10 digits, or "". */
  phone: string
  businessType: RetailTypeKey | null
  logoUrl: string | null
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Could not read that image."))
    reader.readAsDataURL(blob)
  })

export function BusinessDetailsForm({
  initial,
  industry,
  webAddress,
  firebaseConfig,
  testPhones,
  disabled,
}: {
  initial: BusinessDetails
  industry: IndustryKey
  webAddress: string
  firebaseConfig: FirebaseWebConfig | null
  testPhones: string[]
  disabled: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [city, setCity] = useState(initial.city)
  const [phone, setPhone] = useState(initial.phone)
  const [verified, setVerified] = useState(initial.phone)
  const [businessType, setBusinessType] = useState(initial.businessType)
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl)
  /** undefined keeps the saved logo, null removes it, a data URL replaces it. */
  const [logo, setLogo] = useState<string | null | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)
  const shownLogo = logo === undefined ? logoUrl : logo
  const shopTypes = retailTypeList.map((t) => ({ value: t.key, label: t.label }))

  async function pickLogo(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) return toast.error("Choose an image file.")
    try {
      setLogo(await readAsDataUrl(await resizeToPng(file, 256)))
    } catch {
      toast.error("Could not read that image. Try a PNG or JPG.")
    }
  }

  const save = () => {
    if (phone !== verified) return toast.error("Verify your new mobile number with the code we send.")
    start(async () => {
      const res = await saveBusinessDetails({ displayName, city, phone, businessType: businessType ?? undefined, logo })
      if (!res.ok) return void toast.error(res.error)
      setLogoUrl(res.logoUrl)
      setLogo(undefined)
      toast.success("Business details saved.")
      router.refresh()
    })
  }

  return (
    <FieldGroup className="max-w-xl">
      <Field>
        <FieldLabel>Logo</FieldLabel>
        <div className="flex items-center gap-3">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="Your logo" className="size-full object-contain" />
            ) : (
              <HugeiconsIcon icon={ImageUpload01Icon} className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={disabled || pending} onClick={() => fileInput.current?.click()}>
              {shownLogo ? "Change logo" : "Upload logo"}
            </Button>
            {shownLogo ? (
              <Button type="button" variant="ghost" size="sm" disabled={disabled || pending} onClick={() => setLogo(null)}>
                Remove
              </Button>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose logo"
              onChange={(e) => {
                void pickLogo(e.target.files?.[0])
                e.target.value = ""
              }}
            />
          </div>
        </div>
        <FieldDescription>A square image works best. It changes when you save.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="biz-name">Business name</FieldLabel>
        <Input id="biz-name" value={displayName} maxLength={80} disabled={disabled} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      {industry === "retail" ? (
        <Field>
          <FieldLabel>Kind of shop</FieldLabel>
          <Select items={shopTypes} value={businessType} disabled={disabled} onValueChange={(v) => setBusinessType(v as RetailTypeKey)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose your kind of shop" />
            </SelectTrigger>
            <SelectContent>
              {shopTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Changes the words used for your shop. Your products and categories stay as they are.</FieldDescription>
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor="biz-city">City</FieldLabel>
        <Input id="biz-city" value={city} maxLength={60} disabled={disabled} onChange={(e) => setCity(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="phone">Mobile number customers call</FieldLabel>
        {disabled ? (
          <Input id="phone" value={phone} disabled />
        ) : (
          <PhoneVerify config={firebaseConfig} testPhones={testPhones} phone={phone} onPhone={setPhone} verified={verified} onVerified={(p) => { setPhone(p); setVerified(p) }} industry={industry} verify={verifyBusinessPhone} />
        )}
        <FieldDescription>A new number is checked with a code, then saved with the button below.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="biz-web">Web address</FieldLabel>
        <Input id="biz-web" value={webAddress} readOnly disabled />
        <FieldDescription>This can’t be changed here, so links and QR codes you have shared keep working.</FieldDescription>
      </Field>
      <Button type="button" className="w-fit" disabled={disabled || pending} onClick={save}>
        {pending ? "Saving..." : "Save changes"}
      </Button>
    </FieldGroup>
  )
}
