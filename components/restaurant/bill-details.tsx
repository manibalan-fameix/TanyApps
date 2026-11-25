import { cn } from "@/lib/utils"

/**
 * The "Bill details" card. The guest's checkout and the staff's order screen both use it, so the bill reads the same on both
 * sides. The caller passes `BillRow` lines followed by one `BillTotal`, and styles the card's outer box with `className`.
 */
export function BillDetails({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("grid gap-3", className)} aria-labelledby={id}>
      <h2 id={id} className="text-[13px] font-semibold tracking-[0.16em] text-muted-foreground uppercase md:text-[15px]">Bill details</h2>
      <dl className="grid [&>div]:py-3 [&>div:first-child]:pt-1 [&>div+div]:border-t [&>div+div]:border-dashed">{children}</dl>
    </section>
  )
}

/** One line of the bill: label left, amount right. */
export function BillRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-[13px] md:text-[15px]", tone === "success" && "text-success")}>
      <dt className={tone === "success" ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className={tone === "success" ? undefined : "font-medium"}>{value}</dd>
    </div>
  )
}

export function BillTotal({ label = "To pay", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15px] font-bold md:text-[17px]">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
