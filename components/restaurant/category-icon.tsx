import { HugeiconsIcon } from "@hugeicons/react"

import { categoryLook } from "@/lib/restaurant/category-icon"
import { cn } from "@/lib/utils"

/**
 * A category's icon on its colour, filling the box it is put in (the box sets the size and corner shape). On a dark background the
 * light ground turns dark, so the icon takes the colour's light shade there.
 */
export function CategoryIcon({ name, className, iconClassName }: { name: string; className?: string; iconClassName?: string }) {
  const { icon, colour } = categoryLook(name)
  return (
    <span
      aria-hidden
      data-category-icon=""
      style={{ "--tile": `var(--ground-${colour})`, "--ink": `var(--logo-${colour})`, "--ink-dark": `var(--logo-${colour}-fg)` } as React.CSSProperties}
      className={cn("flex size-full shrink-0 items-center justify-center bg-(--tile) text-(--ink) dark:text-(--ink-dark)", className)}
    >
      <HugeiconsIcon icon={icon} strokeWidth={1.75} className={cn("size-1/2", iconClassName)} />
    </span>
  )
}
