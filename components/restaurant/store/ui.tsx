import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { STORE_CONTENT } from "@/components/restaurant/store/layout"
import { cn } from "@/lib/utils"

/** Standard page body: same content width as the header and footer. */
export function StorePage({ children, className }: { children: React.ReactNode; className?: string }) {
  return <main className={cn(STORE_CONTENT, "py-8", className)}>{children}</main>
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold tracking-[0.22em] text-primary uppercase">{children}</p>
}

export function SectionTitle({ eyebrow, title, hint, action }: { eyebrow?: string; title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? (
        <Link href={action.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}

export function StoreEmpty({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action ? (
        <Link href={action.href} className={cn(buttonVariants())}>
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}

export function CategoryChip({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-4xl border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted"
      )}
    >
      {label}
    </Link>
  )
}

/** Card grid used for every dish list. Same columns and gaps as the motors listings. */
export const DISH_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3"
