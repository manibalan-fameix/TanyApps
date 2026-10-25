"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ShareDelivery } from "@/components/restaurant/share-delivery"
import { Button } from "@/components/ui/button"
import { assignPartner } from "@/lib/restaurant/admin-actions"

const NONE = "none"

export function AssignPartner({ orderId, current, partners, disabled }: { orderId: string; current: string | null; partners: { id: string; label: string }[]; disabled?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [sharing, setSharing] = useState(false)
  const items = [{ value: NONE, label: "Not assigned" }, ...partners.map((p) => ({ value: p.id, label: p.label }))]
  return (
    <div className="flex flex-wrap items-center gap-2">
    <Select
      items={items}
      value={current ?? NONE}
      disabled={disabled || pending}
      onValueChange={(v) =>
        start(async () => {
          const res = await assignPartner(orderId, v === NONE ? null : String(v))
          if (res.ok) {
            toast.success(v === NONE ? "Rider removed." : "Rider assigned.")
            if (v !== NONE) setSharing(true)
            router.refresh()
          } else toast.error(res.error)
        })
      }
    >
      <SelectTrigger className="w-full max-w-xs" aria-label="Delivery partner">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    {current ? <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setSharing(true)}>Share links</Button> : null}
    <ShareDelivery orderId={orderId} open={sharing} onOpenChange={setSharing} />
    </div>
  )
}
