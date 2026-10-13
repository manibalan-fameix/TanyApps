"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getShareLinks, type ShareLinks } from "@/lib/restaurant/admin-actions"

/** The two messages for an assigned delivery: the rider's private link, and the guest's live tracking link. */
export function ShareDelivery({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [links, setLinks] = useState<ShareLinks | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    void getShareLinks(orderId).then((r) => {
      if (!live) return
      setLinks(r.ok ? r.links : null)
      setError(r.ok ? null : r.error)
    })
    return () => {
      live = false
    }
  }, [open, orderId])

  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error("Could not copy."))
  const open_ = (url: string) => window.open(url, "_blank", "noopener,noreferrer")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this delivery</DialogTitle>
          <DialogDescription>Send the rider their private link, and send the guest a live tracking link. Each opens WhatsApp with the message ready.</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {!links && !error ? <p className="text-sm text-muted-foreground">Preparing links…</p> : null}
        {links ? (
          <div className="grid gap-4 text-sm">
            <div className="grid gap-2 rounded-xl border p-3">
              <p className="font-medium">To the rider · {links.riderName}</p>
              <p className="break-all text-xs text-muted-foreground">{links.riderUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => open_(links.riderWhatsApp)}>Send on WhatsApp</Button>
                <Button size="sm" variant="outline" onClick={() => void copy(links.riderUrl, "Rider link")}>Copy link</Button>
              </div>
            </div>
            <div className="grid gap-2 rounded-xl border p-3">
              <p className="font-medium">To the guest · {links.customerPhone}</p>
              <p className="break-all text-xs text-muted-foreground">{links.trackUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => open_(links.customerWhatsApp)}>Send on WhatsApp</Button>
                <Button size="sm" variant="outline" onClick={() => void copy(links.trackUrl, "Tracking link")}>Copy link</Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
