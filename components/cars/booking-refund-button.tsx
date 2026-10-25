"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "@/lib/toast"

import { refundBooking } from "@/app/(admin)/(shell)/cars/[id]/actions"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

export function BookingRefundButton({ bookingId, retry = false }: { bookingId: string; retry?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const refund = () => {
    start(async () => {
      const res = await refundBooking(bookingId)
      if (!res.ok) toast.error(res.error)
      else if (res.refund === "processed") toast.success("Refund sent to the buyer.")
      else toast.success("Refund started. It can take 5-7 working days to reach the buyer.")
      router.refresh()
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline" size="sm" disabled={pending} />}
      >
        {retry ? "Retry refund" : "Refund booking"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Refund this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            The full amount is sent back to the buyer. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep booking</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={refund}>
            Refund
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
