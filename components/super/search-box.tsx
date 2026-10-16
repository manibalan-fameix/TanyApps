"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** The search field: used in the page header on every screen and again, larger, on the results page. */
export function SuperSearchBox({
  defaultValue = "",
  className,
  autoFocus,
}: {
  defaultValue?: string
  className?: string
  autoFocus?: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState(defaultValue)
  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault()
        if (q.trim())
          router.push(`/super/search?q=${encodeURIComponent(q.trim())}`)
      }}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search businesses, people, orders, cars"
        aria-label="Search"
        className="pl-9"
        autoFocus={autoFocus}
      />
    </form>
  )
}
