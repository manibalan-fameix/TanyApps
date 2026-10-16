import Link from "next/link"

import { cn } from "@/lib/utils"

/** Page-level tabs that are real links, so each tab has its own address and loads only its own data. Same pill look as the grid tabs. */
export function LinkTabs({
  tabs,
  active,
  base,
}: {
  tabs: { key: string; label: string; count?: number }[]
  active: string
  base: string
}) {
  return (
    <nav aria-label="Sections" className="-mx-1 overflow-x-auto px-1">
      <div className="inline-flex w-fit items-center rounded-full bg-muted p-1 text-muted-foreground">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.key}`}
            aria-current={t.key === active ? "page" : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-2 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-all hover:text-foreground",
              t.key === active
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground/60"
            )}
          >
            {t.label}
            {t.count != null ? (
              <span className="text-xs text-muted-foreground">{t.count}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  )
}
