import type { QuoteSuccess } from "@/lib/cabs/fare"
import { cabsCopy } from "@/lib/cabs/lang"
import { formatPaise } from "@/lib/cabs/money"
import { cn } from "@/lib/utils"

/** A quote as the customer will read it: each line, the total, and the advance. The same component serves the booking page later. */
export function FareBreakdown({ result, className, lang = "en" }: { result: QuoteSuccess; className?: string; lang?: string }) {
  const text = cabsCopy(lang)
  return (
    <div className={cn("flex flex-col gap-3 text-sm", className)}>
      <ul className="flex flex-col divide-y rounded-lg border">
        {result.lines.map((l) => (
          <li key={l.key} className={cn("flex items-start justify-between gap-4 px-3 py-2", !l.included && "text-muted-foreground")}>
            <span className="flex flex-col">
              <span className={cn(l.kind === "tax" && "text-muted-foreground")}>{l.label}</span>
              {l.detail ? <span className="text-xs text-muted-foreground">{l.detail}</span> : null}
            </span>
            <span className={cn("whitespace-nowrap tabular-nums", l.kind === "discount" && "text-success", !l.included && "italic")}>{l.included ? formatPaise(l.paise) : `≈ ${formatPaise(l.paise)} extra`}</span>
          </li>
        ))}
        <li className="flex items-center justify-between bg-muted/40 px-3 py-3 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums" data-testid="fare-total">{formatPaise(result.totalPaise)}</span>
        </li>
      </ul>
      {result.advanceDuePaise !== null ? (
        <p className="flex justify-between px-1">
          <span className="text-muted-foreground">Advance to confirm the booking</span>
          <span className="tabular-nums">{formatPaise(result.advanceDuePaise)}</span>
        </p>
      ) : null}
      {result.notices.map((n) => (
        <p key={n} className="px-1 text-xs text-muted-foreground" data-testid={`notice-${n}`}>{text.notices[n]}</p>
      ))}
      {result.warnings.map((w) => (
        <p key={w} className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">{w}</p>
      ))}
    </div>
  )
}
