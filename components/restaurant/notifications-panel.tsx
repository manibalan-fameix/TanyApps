"use client"

import Link from "next/link"
import { useEffect } from "react"

import { useOrderAlerts } from "@/components/restaurant/order-alerts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FULFILMENT_LABEL, type Fulfilment } from "@/lib/restaurant/settings"

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" })

export function NotificationsPanel() {
  const a = useOrderAlerts()
  const { markAllSeen } = a
  // Opening this page counts as reading what is listed.
  useEffect(() => {
    markAllSeen()
  }, [markAllSeen, a.recent.length])
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={a.connected ? "default" : "secondary"}>{a.connected ? "Watching for new orders" : "Offline. Retrying…"}</Badge>
        {!a.soundOn ? <Button size="sm" variant="secondary" onClick={a.enableSound}>Enable sound</Button> : <Badge variant="outline">Sound on</Badge>}
        <Button size="sm" variant="outline" onClick={a.toggleMuted}>{a.muted ? "Unmute chime" : "Mute chime"}</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent order alerts</CardTitle>
          <CardDescription>Orders that arrived while this window was open. For the full list, open Orders.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {a.recent.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No new orders yet. Keep this tab open and a chime plays when one arrives.</p>
          ) : (
            a.recent.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/60">
                <div>
                  <p className="font-medium">New order {o.code}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{o.customerName} · {o.itemCount} {o.itemCount === 1 ? "item" : "items"} · {FULFILMENT_LABEL[o.fulfilment as Fulfilment] ?? o.fulfilment}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{dateFmt.format(new Date(o.createdAt))}</p>
                </div>
                <span className="text-lg font-semibold text-primary">₹{o.total.toLocaleString("en-IN")}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
