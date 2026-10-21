"use client"

import { useRef, useState } from "react"

import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { placeDetails, searchPlaces } from "@/lib/cabs/places-actions"
import type { PlaceDetail, PlaceSuggestion } from "@/lib/core/geo/places"

/**
 * Type a place, pick from the suggestions. The browser makes a fresh session token (a version 4 UUID) for each search, sends it
 * with every keystroke's lookup and with the final choice, so Google bills the whole thing as one session. The browser only ever
 * talks to our server actions: it never sees the maps key.
 */
export function PlacePicker({ id, label, onPick, placeholder }: { id: string; label: string; onPick: (p: PlaceDetail | null) => void; placeholder?: string }) {
  const [text, setText] = useState("")
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [message, setMessage] = useState("")
  const token = useRef<string>("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(0)

  function typed(value: string) {
    setText(value)
    onPick(null)
    setMessage("")
    if (timer.current) clearTimeout(timer.current)
    if (value.trim().length < 3) return setSuggestions([])
    token.current ||= crypto.randomUUID()
    const ticket = ++latest.current
    // Wait for a pause in typing, so one search costs one lookup, not one per letter.
    timer.current = setTimeout(async () => {
      const res = await searchPlaces(value, token.current)
      if (ticket !== latest.current) return
      if (!res.ok) return void (setSuggestions([]), setMessage(res.error))
      setSuggestions(res.suggestions)
      if (res.suggestions.length === 0) setMessage("No places found.")
    }, 300)
  }

  async function choose(s: PlaceSuggestion) {
    setSuggestions([])
    setText([s.primary, s.secondary].filter(Boolean).join(", "))
    const res = await placeDetails(s.placeId, token.current)
    token.current = "" // the details call ended the session; the next search starts a new one
    if (!res.ok) return setMessage(res.error)
    onPick(res.place)
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input id={id} value={text} placeholder={placeholder ?? "Start typing a place"} autoComplete="off" role="combobox" aria-expanded={suggestions.length > 0} onChange={(e) => typed(e.target.value)} />
        {suggestions.length > 0 ? (
          <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-sm shadow-md">
            {suggestions.map((s) => (
              <li key={s.placeId} role="option" aria-selected={false}>
                <button type="button" className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted" onClick={() => void choose(s)}>
                  <span className="font-medium">{s.primary}</span>
                  {s.secondary ? <span className="text-xs text-muted-foreground">{s.secondary}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </Field>
  )
}
