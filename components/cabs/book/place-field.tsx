"use client"

import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { bookingText } from "@/lib/cabs/booking-copy"
import { placeDetailsPublic, quickPickPublic, searchPlacesPublic } from "@/lib/cabs/public-actions"
import type { Lang } from "@/lib/cabs/lang"
import type { PlaceSuggestion } from "@/lib/core/geo/places"

export type PickedPlace = { token: string; name: string } | null
export type QuickPickItem = { key: string; label: string }

/**
 * Type a place and pick it, or tap an airport or station. The browser never sees the maps key and never holds an editable place:
 * a chosen place comes back from the server sealed, and only that sealed value is sent when pricing and booking.
 */
export function PlaceField({ id, label, placeholder, value, onChange, quick, lang }: { id: string; label: string; placeholder: string; value: PickedPlace; onChange: (p: PickedPlace) => void; quick: QuickPickItem[]; lang: Lang }) {
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
      const res = await searchPlacesPublic(v, session.current)
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

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <Input id={id} value={text} placeholder={placeholder} autoComplete="off" onChange={(e) => typed(e.target.value)} className="h-11 text-base" aria-describedby={`${id}-hint`} />
        {suggestions.length > 0 ? (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border bg-popover shadow-md" role="listbox">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button type="button" className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted" onClick={() => choose(s)}>
                  <span className="text-sm font-medium">{s.primary}</span>
                  {s.secondary ? <span className="text-xs text-muted-foreground">{s.secondary}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">{message || (text.trim().length < 3 ? t.searchHint : "")}</p>
      {quick.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={t.quickPicks}>
          {quick.map((q) => (
            <Button key={q.key} type="button" size="sm" variant="outline" className="rounded-full" onClick={() => pick(q)}>
              {q.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
