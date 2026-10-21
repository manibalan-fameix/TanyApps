"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { PlaceField, type PickedPlace, type QuickPickItem } from "@/components/cabs/book/place-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"
import { deleteAddress, deleteContact, saveAddress, saveContact, updateProfile } from "@/lib/cabs/public-actions"

type Address = { id: string; label: string; text: string }
type Contact = { id: string; name: string; phone: string }

export function AccountForms({ lang, name, phone, addresses, contacts, quick }: { lang: Lang; name: string; phone: string; addresses: Address[]; contacts: Contact[]; quick: QuickPickItem[] }) {
  const t = bookingText(lang)
  const router = useRouter()
  const [pending, start] = useTransition()
  const [nm, setNm] = useState(name)
  const [lg, setLg] = useState<Lang>(lang)
  const [note, setNote] = useState("")
  const [label, setLabel] = useState("")
  const [place, setPlace] = useState<PickedPlace>(null)
  const [cName, setCName] = useState("")
  const [cPhone, setCPhone] = useState("")
  const [cError, setCError] = useState("")

  const refresh = () => router.refresh()

  async function signOut(everywhere: boolean) {
    await fetch("/api/t/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ everywhere }) })
    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.yourPhone}: <span className="font-medium text-foreground">{phone}</span></p>
        <label htmlFor="profile-name" className="text-sm font-medium">{t.yourName}</label>
        <Input id="profile-name" value={nm} maxLength={80} onChange={(e) => setNm(e.target.value)} className="h-11 text-base" />
        <span className="text-sm font-medium" id="profile-lang">{t.language}</span>
        <div className="flex gap-2" role="radiogroup" aria-labelledby="profile-lang">
          {(["en", "ta"] as const).map((l) => (
            <Button key={l} type="button" role="radio" aria-checked={lg === l} variant={lg === l ? "default" : "outline"} className="h-11" onClick={() => setLg(l)}>
              {l === "en" ? "English" : "தமிழ்"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateProfile({ name: nm, language: lg })
                if (r.ok) {
                  document.cookie = `tany_lang=${lg}; Path=/; Max-Age=31536000; SameSite=Lax`
                  setNote(bookingText(lg).saved)
                  refresh()
                }
              })
            }
          >
            {t.save}
          </Button>
          {note ? <span role="status" className="text-sm text-muted-foreground">{note}</span> : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.savedAddresses}</h2>
        {addresses.length === 0 ? <p className="text-sm text-muted-foreground">{t.noAddresses}</p> : null}
        <ul className="flex flex-col gap-2">
          {addresses.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span><span className="font-medium">{a.label}</span><br /><span className="text-muted-foreground">{a.text}</span></span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await deleteAddress(a.id); refresh() })}>{t.remove}</Button>
            </li>
          ))}
        </ul>
        <Input aria-label={t.addressLabel} placeholder={t.addressLabel} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} className="h-11" />
        <PlaceField id="addr" label={t.pickup} placeholder={t.pickupPlaceholder} value={place} onChange={setPlace} quick={quick} lang={lang} />
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start"
          disabled={pending || !label.trim() || !place}
          onClick={() =>
            start(async () => {
              if (!place) return
              const r = await saveAddress({ label, place: place.token })
              if (r.ok) {
                setLabel("")
                setPlace(null)
                refresh()
              }
            })
          }
        >
          {t.addAddress}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t.emergencyContacts}</h2>
        <p className="text-sm text-muted-foreground">{t.emergencyHelp}</p>
        <ul className="flex flex-col gap-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span><span className="font-medium">{c.name}</span> · {c.phone}</span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => { await deleteContact(c.id); refresh() })}>{t.remove}</Button>
            </li>
          ))}
        </ul>
        <Input aria-label={t.contactName} placeholder={t.contactName} value={cName} maxLength={60} onChange={(e) => setCName(e.target.value)} className="h-11" />
        <Input aria-label={t.contactPhone} placeholder={t.contactPhone} inputMode="numeric" value={cPhone} maxLength={10} onChange={(e) => setCPhone(e.target.value.replace(/\D/g, ""))} className="h-11" />
        {cError ? <p role="alert" className="text-sm text-destructive">{cError}</p> : null}
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start"
          disabled={pending || !cName.trim() || cPhone.length !== 10}
          onClick={() =>
            start(async () => {
              const r = await saveContact({ name: cName, phone: cPhone })
              if (r.ok) {
                setCName("")
                setCPhone("")
                setCError("")
                refresh()
              } else setCError(r.error === "limit" ? t.contactLimit : t.contactPhoneBad)
            })
          }
        >
          {t.addContact}
        </Button>
      </section>

      <section className="flex flex-col gap-3 border-t pt-6">
        <Button type="button" variant="outline" className="h-11 self-start" onClick={() => signOut(false)}>{t.signOut}</Button>
        <div className="flex flex-col gap-1">
          <Button type="button" variant="destructive" className="h-11 self-start" data-testid="sign-out-everywhere" onClick={() => signOut(true)}>{t.signOutEverywhere}</Button>
          <p className="text-xs text-muted-foreground">{t.signOutEverywhereHelp}</p>
        </div>
      </section>
    </div>
  )
}
