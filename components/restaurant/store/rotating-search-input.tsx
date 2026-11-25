"use client"

import { useState } from "react"
import { RotatingText, RotatingTextContainer } from "@animate-ui/react/primitives/texts/rotating"

/**
 * A search box whose hint changes every few seconds: Search for "Snacks", then Search for "Dairy", and so on, from what the store
 * really sells. "Search for" stays put and only the quoted word changes, using Animate UI's RotatingText (it slides each word in and
 * out, follows the reduced-motion setting and pauses while the tab is hidden). The hint is a quiet overlay (the real placeholder
 * stays for screen readers), and it steps aside the moment the box is focused or has text in it.
 */
export function RotatingSearchInput({ hints, fallback, label, className }: { hints: string[]; fallback: string; label: string; className?: string }) {
  const [focused, setFocused] = useState(false)
  const [hasText, setHasText] = useState(false)

  return (
    <div className="relative min-w-0 flex-1">
      <input
        name="q"
        type="search"
        enterKeyHint="search"
        aria-label={label}
        placeholder={fallback}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => setHasText(e.target.value.length > 0)}
        className={className}
      />
      {hints.length > 0 && !focused && !hasText ? (
        // Covers the input's own placeholder (same background) with the rotating one; clicks fall through to the input.
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden bg-muted text-sm text-muted-foreground">
          <span className="shrink-0 whitespace-pre">Search for </span>
          <RotatingTextContainer text={hints.map((h) => `“${h}”`)} duration={2600} y={-14} align="start" className="min-w-0 !py-0">
            <RotatingText />
          </RotatingTextContainer>
        </span>
      ) : null}
    </div>
  )
}
