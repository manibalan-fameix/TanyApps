import Link from "next/link"

import type { BusinessRow } from "@/lib/super/data"
import { PHASE_LABEL, fmtDate, label } from "@/lib/super/format"

/** A compact list of businesses for dashboard cards, in the same row style as "Recent leads". */
export function BusinessList({
  rows,
  empty,
  detail,
}: {
  rows: BusinessRow[]
  empty: string
  detail: "trial" | "phase" | "joined" | "activity"
}) {
  if (rows.length === 0) return <p className="text-muted-foreground">{empty}</p>
  const text = (r: BusinessRow) =>
    detail === "trial"
      ? `Ends ${fmtDate(r.trialEndsAt)}`
      : detail === "phase"
        ? (PHASE_LABEL[r.phase] ?? label(r.phase))
        : detail === "joined"
          ? fmtDate(r.createdAt)
          : `${r.leads} leads · ${r.orders} orders`
  return (
    <>
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/super/businesses/${r.id}`}
          className="flex items-center justify-between gap-3 py-2 hover:underline"
        >
          <span className="min-w-0 truncate font-medium">
            {r.name}
            <span className="font-normal text-muted-foreground">
              {" "}
              · {r.planLabel}
            </span>
          </span>
          <span className="shrink-0 text-muted-foreground">{text(r)}</span>
        </Link>
      ))}
    </>
  )
}
