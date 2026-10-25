"use client"

import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Airplane01Icon, Location01Icon, Search01Icon, Train01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { ListRow } from "@/components/cabs/book/list-row"
import { type LivePoint, distanceLabel, meters } from "@/components/cabs/book/use-live-location"
import { Input } from "@/components/ui/input"
import { bookingText } from "@/lib/cabs/booking-copy"
import { placeDetailsPublic, quickPickPublic, searchPlacesPublic } from "@/lib/cabs/public-actions"
import type { Lang } from "@/lib/cabs/lang"
import type { PlaceSuggestion } from "@/lib/core/geo/places"

export type PickedPlace = { token: string; name: string } | null
export type QuickPickItem = { key: string; label: string; kind?: "airport" | "rail"; lat?: number; lng?: number }

/**
 * Type a place and pick it, or tap an airport or station. The browser never sees the maps key and never holds an editable place:
 * a chosen place comes back from the server sealed, and only that sealed value is sent when pricing and booking.
 */
export function PlaceField({ id, label, placeholder, value, onChange, quick, quickHost, lang, here }: { id: string; label: string; placeholder: string; value: PickedPlace; onChange: (p: PickedPlace) => void; quick: QuickPickItem[]; quickHost?: HTMLElement | null; lang: Lang; here?: LivePoint | null }) {
  const t = bookingText(lang)
  const [text, setText] = useState(value?.name ?? "")
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [message, setMessage] = useState("")
  const session = useRef("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(0)

  function typed(v: string) {
    setText(v)
    onChange(null)
    setMessage("")
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 3) return setSuggestions([])
    session.current ||= crypto.randomUUID()
    const ticket = ++latest.current
    timer.current = setTimeout(async () => {
      const res = await searchPlacesPublic(v, session.current, here)
      if (ticket !== latest.current) return
      if (!res.ok) return void (setSuggestions([]), setMessage(res.code === "busy" ? t.err_busy : t.err_unavailable))
      setSuggestions(res.suggestions)
      setMessage(res.suggestions.length === 0 ? t.noPlaces : "")
    }, 300)
  }

  async function choose(s: PlaceSuggestion) {
    setSuggestions([])
    setText([s.primary, s.secondary].filter(Boolean).join(", "))
    const res = await placeDetailsPublic(s.placeId, session.current)
    session.current = ""
    if (!res.ok) return setMessage(res.code === "busy" ? t.err_busy : t.err_generic)
    setText(res.place.name)
    onChange({ token: res.place.token, name: res.place.name })
  }

  async function pick(q: QuickPickItem) {
    setSuggestions([])
    setMessage("")
    const res = await quickPickPublic(q.key)
    if (!res.ok) return setMessage(res.code === "busy" ? t.err_busy : t.err_unavailable)
    setText(res.place.name)
    onChange({ token: res.place.token, name: res.place.name })
  }

  const quickList =
    quick.length > 0 ? (
        <ul aria-label={t.quickPicks} className="flex flex-col">
          {quick.map((q) => (
            <li key={q.key}>
              <ListRow icon={q.kind === "rail" ? Train01Icon : Airplane01Icon} title={q.label} subtitle={q.kind === "rail" ? t.quickRail : t.quickAirport} trailing={distanceLabel(here ?? null, q)} onClick={() => pick(q)} />
            </li>
          ))}
        </ul>
      ) : null
  const placed = quickHost && quickList ? createPortal(quickList, quickHost) : quickList

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="relative">
        <HugeiconsIcon icon={value ? Location01Icon : Search01Icon} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input id={id} value={text} placeholder={placeholder} autoComplete="off" onChange={(e) => typed(e.target.value)} className="h-12 rounded-xl border-transparent bg-muted pl-11 text-base shadow-none focus-visible:bg-background" aria-describedby={`${id}-hint`} />
        {suggestions.length > 0 ? (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border bg-popover shadow-lg" role="listbox">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <ListRow icon={Location01Icon} title={s.primary} subtitle={s.secondary} trailing={typeof s.distanceM === "number" ? meters(s.distanceM) : null} className="rounded-none px-3" onClick={() => choose(s)} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {message ? <p id={`${id}-hint`} className="px-1 text-xs text-muted-foreground">{message}</p> : <span id={`${id}-hint`} className="sr-only" />}
      {placed}
    </div>
  )
}
