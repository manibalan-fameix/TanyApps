import { EmptyState, PageHeader } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>What</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Seen</TableHead>
                  <TableHead>What to do</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="align-top">
                      <Badge variant={e.kind === "refund_failed" || e.kind === "unmatched_payment" ? "destructive" : "secondary"}>{e.kind.replace(/_/g, " ")}</Badge>
                      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{e.detail}</p>
                    </TableCell>
                    <TableCell className="align-top font-mono text-xs">{e.ref}</TableCell>
                    <TableCell className="align-top text-sm">
                      {when(e.firstSeenAt)}
                      {e.occurrences > 1 ? <span className="block text-muted-foreground">{e.occurrences}x, last {when(e.lastSeenAt)}</span> : null}
                    </TableCell>
                    <TableCell className="max-w-sm align-top text-sm">{EXCEPTION_HELP[e.kind as keyof typeof EXCEPTION_HELP] ?? "Investigate in Razorpay."}</TableCell>
                    <TableCell className="align-top">
                      <ResolveForm id={e.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recently resolved</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {recent.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.kind.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono text-xs">{e.ref}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.resolvedAt ? when(e.resolvedAt) : ""} · {e.resolvedBy}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.resolution}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
