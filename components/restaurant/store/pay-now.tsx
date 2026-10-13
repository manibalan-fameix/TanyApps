"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { cancelPendingOrder, getPaymentCheckout } from "@/app/(tenant)/sites/[dealer]/actions"
import { payWithRazorpay } from "@/components/restaurant/store/razorpay"
import { Button } from "@/components/ui/button"
import { formatRupees } from "@/lib/restaurant/menu"

/** Shown on an order that is waiting for its online payment: pay again, or drop the order. */
export function PayNow({ code, total, name, phone, color }: { code: string; total: number; name: string; phone: string; color: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)

  async function pay() {
    setBusy(true)
    try {
      const res = await getPaymentCheckout(code)
      if (!res.ok) return void toast.error(res.error)
      const out = await payWithRazorpay(res.checkout, { color, name, phone })
      if (out.status === "done") toast.success("Payment received. Thank you!")
      else if (out.status === "error") toast.error(out.message)
    } finally {
      setBusy(false)
      router.refresh()
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
      <p className="text-sm">Your order is held while you pay. It is released after 20 minutes if the payment is not completed.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" disabled={busy || pending} onClick={pay}>
          {busy ? "Opening payment..." : `Pay ${formatRupees(total)} now`}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={busy || pending}
          onClick={() =>
            window.confirm("Cancel this order?") &&
            start(async () => {
              const res = await cancelPendingOrder(code)
              if (res.ok) toast.success("Order cancelled.")
              else toast.error(res.error)
              router.refresh()
            })
          }
        >
          Cancel order
        </Button>
      </div>
    </div>
  )
}
