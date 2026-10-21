"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"
import { cancelMyBooking } from "@/lib/cabs/public-actions"

export function CancelBooking({ id, lang, operator }: { id: string; lang: Lang; operator: string }) {
  const t = bookingText(lang)
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="outline" className="h-11" data-testid="cancel-booking" />}>{t.cancelBooking}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.cancelTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            <Input aria-label={t.cancelReason} placeholder={t.cancelReason} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
            {error ? <span role="alert" className="mt-2 block text-destructive">{error}</span> : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.keepBooking}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              start(async () => {
                const r = await cancelMyBooking(id, reason)
                if (r.ok) router.refresh()
                else setError(t.cancelFailed.replace("{operator}", operator))
              })
            }}
          >
            {t.confirmCancel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
