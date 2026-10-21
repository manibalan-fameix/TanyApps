import { bookingText } from "@/lib/cabs/booking-copy"
import type { FareLine } from "@/lib/cabs/fare"
import { localizeLine } from "@/lib/cabs/fare-labels"
import { cabsCopy, type Lang } from "@/lib/cabs/lang"
import { formatPaise } from "@/lib/cabs/money"
import { cn } from "@/lib/utils"

/** The fare as a customer reads it, in their language: each line, the total, any advance, and the notice that tolls and parking are extra. */
export function FareLines({ lines, totalPaise, advanceDuePaise, notices, lang }: { lines: FareLine[]; totalPaise: number; advanceDuePaise: number; notices: string[]; lang: Lang }) {
  const t = bookingText(lang)
  const copy = cabsCopy(lang)
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex flex-col divide-y rounded-lg border">
        {lines.map((l) => {
          const { label, detail } = localizeLine(l, lang)
          return (
            <li key={l.key} className={cn("flex items-start justify-between gap-4 px-3 py-2", !l.included && "text-muted-foreground")}>
              <span className="flex flex-col">
                <span className={cn(l.kind === "tax" && "text-muted-foreground")}>{label}</span>
                {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
              </span>
              <span className={cn("whitespace-nowrap tabular-nums", !l.included && "italic")}>{l.included ? formatPaise(l.paise) : t.extraEstimate.replace("{amount}", formatPaise(l.paise))}</span>
            </li>
          )
        })}
        <li className="flex items-center justify-between bg-muted/40 px-3 py-3 text-base font-semibold">
          <span>{t.total}</span>
          <span className="tabular-nums" data-testid="fare-total">{formatPaise(totalPaise)}</span>
        </li>
      </ul>
      {advanceDuePaise > 0 ? <p className="px-1 text-muted-foreground">{t.advanceDue.replace("{amount}", formatPaise(advanceDuePaise))}</p> : null}
      {notices.map((n) => (
        <p key={n} className="px-1 text-xs text-muted-foreground" data-testid={`notice-${n}`}>
          {copy.notices[n as keyof typeof copy.notices]}
        </p>
      ))}
    </div>
  )
}
