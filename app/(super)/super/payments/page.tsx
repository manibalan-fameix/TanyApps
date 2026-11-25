import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SimpleTable } from "@/components/data-table/simple-table"
import { EXCEPTION_HELP, listExceptions } from "@/lib/core/payment-exceptions"
import { requireSuperAdmin } from "@/lib/super/guard"

import { ResolveForm } from "./resolve-form"

export const metadata = { title: "Payment exceptions" }
export const dynamic = "force-dynamic"

const when = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

export default async function Page() {
  await requireSuperAdmin()
  const open = await listExceptions({ status: "open" })
  const recent = (await listExceptions({ status: "resolved", limit: 25 }))
  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Payment exceptions" description="Money that needs a person: unmatched or doubled payments, refunds that failed or are stuck, webhooks that keep failing." />
      {open.length === 0 ? (
        <EmptyState title="Nothing needs attention" body="Every payment and refund is where it should be. This list updates every five minutes and as payments arrive." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Open ({open.length})</CardTitle>
            <CardDescription>Oldest problems are not first: the list is ordered by the latest sighting. Open the Razorpay dashboard with the reference, act, then resolve with a note.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
              columns={[{ title: "What" }, { title: "Reference" }, { title: "Seen" }, { title: "What to do" }, { title: "" }]}
              rows={open.map((e) => ({
                id: e.id,
                cells: [
                  <div key="what">
                    <Badge variant={e.kind === "refund_failed" || e.kind === "unmatched_payment" ? "destructive" : "secondary"}>{e.kind.replace(/_/g, " ")}</Badge>
                    <p className="mt-1 max-w-xs text-sm text-muted-foreground">{e.detail}</p>
                  </div>,
                  <span key="ref" className="font-mono text-xs">{e.ref}</span>,
                  <span key="seen" className="text-sm">
                    {when(e.firstSeenAt)}
                    {e.occurrences > 1 ? <span className="block text-muted-foreground">{e.occurrences}x, last {when(e.lastSeenAt)}</span> : null}
                  </span>,
                  <p key="help" className="max-w-sm text-sm">{EXCEPTION_HELP[e.kind as keyof typeof EXCEPTION_HELP] ?? "Investigate in Razorpay."}</p>,
                  <ResolveForm key="resolve" id={e.id} />,
                ],
              }))}
            />
          </CardContent>
        </Card>
      )}
      {recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recently resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleTable
              columns={[{ title: "What" }, { title: "Reference" }, { title: "Resolved" }, { title: "Note" }]}
              rows={recent.map((e) => ({
                id: e.id,
                cells: [
                  <span key="what" className="text-sm">{e.kind.replace(/_/g, " ")}</span>,
                  <span key="ref" className="font-mono text-xs">{e.ref}</span>,
                  <span key="when" className="text-sm text-muted-foreground">{e.resolvedAt ? when(e.resolvedAt) : ""} · {e.resolvedBy}</span>,
                  <span key="note" className="text-sm text-muted-foreground">{e.resolution}</span>,
                ],
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
