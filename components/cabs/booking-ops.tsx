"use client"

import { useState } from "react"

import { MoneyField, useAction } from "@/components/cabs/kit"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { acceptBooking, adjustBookingFare, cancelBookingAsOperator, rejectBooking } from "@/lib/cabs/booking-admin-actions"
import type { TripStatus } from "@/lib/cabs/trip-status"

type Panel = null | "reject" | "adjust" | "cancel"

/** The things an operator can do with one booking. Only the actions the status allows are shown. */
export function BookingOps({ id, status, currentRupees }: { id: string; status: TripStatus; currentRupees: string }) {
  const { run, pending, fieldErrors } = useAction()
  const [panel, setPanel] = useState<Panel>(null)
  const [reason, setReason] = useState("")
  const [rupees, setRupees] = useState(currentRupees)
  const open = status === "requested" || status === "confirmed"
  if (!open) return null
  const close = () => {
    setPanel(null)
    setReason("")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {status === "requested" ? (
          <>
            <Button type="button" className="h-10" disabled={pending} data-testid="accept-booking" onClick={() => run(() => acceptBooking(id), { success: "Booking accepted." })}>
              Accept
            </Button>
            <Button type="button" variant="outline" className="h-10" disabled={pending} data-testid="reject-booking" onClick={() => setPanel("reject")}>
              Reject
            </Button>
          </>
        ) : null}
        <Button type="button" variant="outline" className="h-10" disabled={pending} data-testid="adjust-fare" onClick={() => setPanel("adjust")}>
          Adjust fare
        </Button>
        <Button type="button" variant="outline" className="h-10" disabled={pending} data-testid="cancel-booking-op" onClick={() => setPanel("cancel")}>
          Cancel booking
        </Button>
      </div>

      {panel ? (
        <div className="flex max-w-md flex-col gap-3 rounded-lg border p-4">
          {panel === "adjust" ? <MoneyField id="adj-fare" label="Agreed fare (₹)" value={rupees} onChange={setRupees} hint="The customer's quote stays on record. This is the fare you agreed instead." /> : null}
          <Field>
            <FieldLabel htmlFor="op-reason">Reason (kept in the audit log)</FieldLabel>
            <Textarea id="op-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            {fieldErrors.reason ? <p className="text-sm text-destructive">{fieldErrors.reason}</p> : null}
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={pending}
              data-testid="confirm-action"
              onClick={() => {
                const done = { onOk: close }
                if (panel === "reject") run(() => rejectBooking(id, reason), { success: "Booking rejected.", ...done })
                if (panel === "adjust") run(() => adjustBookingFare(id, rupees, reason), { success: "Fare adjusted.", ...done })
                if (panel === "cancel") run(() => cancelBookingAsOperator(id, reason), { success: "Booking cancelled.", ...done })
              }}
            >
              {{ reject: "Reject booking", adjust: "Save fare", cancel: "Cancel booking" }[panel]}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Back
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

