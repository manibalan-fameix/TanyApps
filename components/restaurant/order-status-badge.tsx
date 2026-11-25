import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { STEP_ICON } from "@/components/restaurant/store/order-sheet"
import { Badge } from "@/components/ui/badge"
import { STATUS_LABEL, type OrderStatus } from "@/lib/restaurant/orders"

/** An order's status, with the same icon the guest sees for that step. */
export function OrderStatusBadge({ status }: { status: string }) {
  const s = status as OrderStatus
  return (
    <Badge variant={s === "new" ? "default" : s === "cancelled" ? "destructive" : s === "completed" ? "outline" : "secondary"}>
      <HugeiconsIcon icon={s === "cancelled" ? Cancel01Icon : STEP_ICON[s]} data-icon="inline-start" />
      {STATUS_LABEL[s]}
    </Badge>
  )
}
