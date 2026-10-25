"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "@/lib/toast"

import {
  cancelPlan,
  startCheckout,
} from "@/app/(admin)/(shell)/settings/billing/actions"
import {
  PricingTable,
  type PlanStatus,
} from "@/components/billing/pricing-table"
import { authorisePayment } from "@/components/billing/razorpay-checkout"
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
import {
  PLANS,
  type BillingCycle,
  type PlanKey,
  type SellablePlanKey,
} from "@/lib/plans"

export function BillingPanel({
  currentPlan,
  currentCycle,
  hasPaymentMethod,
  cancelling,
  canManage,
  endsOn,
  note,
  statusPlan,
  status,
  industry,
}: {
  currentPlan: PlanKey
  currentCycle: BillingCycle
  /** A payment method is authorised and the plan is not cancelled. */
  hasPaymentMethod: boolean
  cancelling: boolean
  canManage: boolean
  /** Formatted date the covered period ends, if any. */
  endsOn: string | null
  /** Small print under the plans. */
  note?: React.ReactNode
  statusPlan: PlanKey
  status: PlanStatus
  industry?: string
}) {
  const router = useRouter()
  const [cycle, setCycle] = useState(currentCycle)
  const [pending, startTransition] = useTransition()

  function pay(plan: SellablePlanKey) {
    startTransition(async () => {
      const res = await startCheckout({ plan, cycle })
      if (!res.ok) return void toast.error(res.error)
      const result = await authorisePayment(res.checkout, {
        description: `${PLANS[plan].label} (${cycle})`,
        color: "#E5270B",
      })
      if (result === "done")
        toast.success(
          hasPaymentMethod ? "Plan updated" : "Payment method added"
        )
      else if (result === "unconfirmed")
        toast.warning(
          "Payment received. It can take a minute to show here. Refresh shortly."
        )
      else if (result === "unavailable")
        toast.error(
          "Could not load the payment window. Check your connection and try again."
        )
      else toast.error("Payment was not completed. You have not been charged.")
      router.refresh()
    })
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelPlan()
      if (res.ok)
        toast.success(
          endsOn
            ? `Plan cancelled. Your showroom stays online until ${endsOn}.`
            : "Plan cancelled."
        )
      else toast.error(res.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <PricingTable
        industry={industry}
        cycle={cycle}
        onCycle={setCycle}
        currentPlan={currentPlan}
        currentCycle={currentCycle}
        hasPaymentMethod={hasPaymentMethod}
        cancelling={cancelling}
        canManage={canManage}
        pending={pending}
        onChoose={pay}
        note={note}
        statusPlan={statusPlan}
        status={status}
      />

      {hasPaymentMethod && canManage ? (
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="outline" disabled={pending} />}
          >
            Cancel plan
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel your plan?</AlertDialogTitle>
              <AlertDialogDescription>
                {endsOn
                  ? `Your showroom stays online until ${endsOn}. After that it goes offline and buyers cannot see your cars. You can restart any time.`
                  : "Your showroom will go offline and buyers will not see your cars. You can restart any time."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my plan</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={cancel}>
                Cancel plan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          Only the owner can change billing.
        </p>
      ) : null}
    </div>
  )
}
