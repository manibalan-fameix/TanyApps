import Link from "next/link"
import { redirect } from "next/navigation"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getDealerContext } from "@/lib/auth/context"
import { SOURCES } from "@/lib/analytics/events"
import { fetchPerformance } from "@/lib/analytics/query"
import { titleOf } from "@/lib/cars/title"
import { scopedDb } from "@/lib/db/scoped"
import { tenantUrl } from "@/lib/env"
import { cn } from "@/lib/utils"
import { getAllVariants } from "@/lib/variants/repo"

export const metadata = { title: "Listing performance" }

const RANGES = [7, 30] as const
const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", google: "Google", direct: "Direct / unknown", other: "Other sites" }
/** "views / link clicks" for one source; a dash when nothing came from it. */
const pair = (c: { views: number; clicks: number }) => (c.views || c.clicks ? `${n(c.views)} / ${n(c.clicks)}` : "-")
const n = (v: number) => v.toLocaleString("en-IN")

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  if (!ctx.dealerInDb) return <p className="text-sm text-muted-foreground">Reports are not available in the local demo account.</p>

  const requested = Number((await searchParams).days)
  const days = (RANGES as readonly number[]).includes(requested) ? requested : 7
  const result = await fetchPerformance(ctx.dealer.id, days)

  const rows = await scopedDb(ctx.dealer.id).cars.select()
  const variants = await getAllVariants()
  const variantById = new Map(variants.map((v) => [v.id, v]))
  const carBySlug = new Map(
    rows.filter((c) => c.slug).map((c) => [c.slug as string, { title: titleOf(c.year, c.variantId ? (variantById.get(c.variantId) ?? null) : null) || (c.regPrefix?.toUpperCase() ?? "Car"), status: c.status }])
  )

  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Listing performance</h1>
          <p className="text-sm text-muted-foreground">How each car is doing once you share it. Counted from real visits to your showroom link.</p>
        </div>
        <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Link key={r} href={`/reports?days=${r}`} aria-current={r === days} className={cn(buttonVariants({ size: "sm", variant: r === days ? "default" : "ghost" }))}>
              {r} days
            </Link>
          ))}
        </div>
      </div>

      {!result.ok ? (
        <Alert variant={result.reason === "failed" ? "destructive" : "default"}>
          <AlertTitle>{result.reason === "failed" ? "Could not load the numbers" : "Analytics is not connected yet"}</AlertTitle>
          <AlertDescription>
            {result.reason === "failed"
              ? "Cloudflare did not answer. Try again in a minute."
              : "The Cloudflare token needs the Account Analytics: Read permission. Add it and reload."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["Car page views", result.data.totals.views],
              ["Shared link clicks", result.data.totals.shareClicks],
              ["Chats started", result.data.totals.chats],
              ["Showroom visits", result.data.storeViews],
            ].map(([label, value]) => (
              <Card key={label as string}>
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle className="text-2xl">{n(value as number)}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By listing</CardTitle>
              <CardDescription>
                Last {days} days, most viewed first. Each source column reads views / link clicks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {result.data.listings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No visits yet. Share a car from its page and the numbers appear here within a minute or two.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Car</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Link clicks</TableHead>
                      <TableHead className="text-right">Chats</TableHead>
                      {SOURCES.map((s) => (
                        <TableHead key={s} className="text-right">
                          {SOURCE_LABEL[s]}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.data.listings.map((l) => {
                      const car = carBySlug.get(l.carSlug)
                      return (
                        <TableRow key={l.carSlug}>
                          <TableCell className="max-w-64 truncate font-medium">
                            <a href={tenantUrl(ctx.dealer.slug, `/${l.carSlug}`)} target="_blank" rel="noreferrer" className="hover:underline">
                              {car?.title ?? l.carSlug}
                            </a>
                            {car && car.status !== "live" ? <span className="ml-2 text-xs text-muted-foreground">{car.status}</span> : null}
                          </TableCell>
                          <TableCell className="text-right">{n(l.views)}</TableCell>
                          <TableCell className="text-right">{n(l.shareClicks)}</TableCell>
                          <TableCell className="text-right">{n(l.chats)}</TableCell>
                          {SOURCES.map((s) => (
                            <TableCell key={s} className={cn("text-right tabular-nums", s === l.topSource && "font-semibold")}>
                              {pair(l.sources[s])}
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium">All listings</TableCell>
                      <TableCell className="text-right">{n(result.data.totals.views)}</TableCell>
                      <TableCell className="text-right">{n(result.data.totals.shareClicks)}</TableCell>
                      <TableCell className="text-right">{n(result.data.totals.chats)}</TableCell>
                      {SOURCES.map((s) => (
                        <TableCell key={s} className="text-right tabular-nums">
                          {pair(result.data.sourceTotals[s])}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
