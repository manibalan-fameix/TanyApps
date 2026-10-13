import { redirect } from "next/navigation"

import { BillingPanel } from "@/components/billing/billing-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getDealerContext } from "@/lib/auth/context"
import { GRACE_DAYS, billingState, effectivePlanKey } from "@/lib/billing/state"
import {
  PLANS,
  type BillingCycle,
  type PlanKey,
} from "@/lib/plans"
import { getDealerBilling } from "@/lib/tenant/billing"

export const metadata = { title: "Billing" }

const date = (d: Date) =>
  d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })

const BADGE = {
  free: "Free",
  legacy: "Founding",
  trial: "Free trial",
  active: "Active",
  grace: "Payment pending",
  suspended: "Offline",
} as const

export default async function BillingPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  const dealer =
    ctx.devBypass && !ctx.dealerInDb
      ? null
      : await getDealerBilling(ctx.dealer.id)
  if (!dealer) {
    return (
      <p className="text-sm text-muted-foreground">
        Billing is not available in the local demo account.
      </p>
    )
  }

  const state = billingState(dealer)
  const asPlan = (key: string): PlanKey =>
    key in PLANS ? (key as PlanKey) : "starter"
  const plan = asPlan(effectivePlanKey(dealer))
  // A change bought mid-period that has not taken over yet.
  const upcoming =
    dealer.nextPlan &&
    dealer.nextPlanStartsAt &&
    dealer.nextPlanStartsAt > new Date() &&
    asPlan(dealer.nextPlan) !== plan
      ? asPlan(dealer.nextPlan)
      : null
  const until = state.accessUntil ? date(state.accessUntil) : ""

  const problem = state.paymentIssue
    ? "Your last payment failed. Add a payment method again so your showroom is not taken offline."
    : null

  const headline = {
    free: `You are on the Free plan: up to ${PLANS.free.maxLiveCars} cars live at once. No card needed.`,
    legacy: "Your account is on the founding plan.",
    trial: `Free trial: ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"} left`,
    active: `Paid until ${until}`,
    grace: `Payment pending. Your showroom stays online for ${GRACE_DAYS} days while we retry.`,
    suspended:
      "Your showroom is offline. Add a payment method to bring it back.",
  }[state.phase]

  const lines: string[] = []
  if (state.phase === "trial") {
    lines.push(
      state.hasPaymentMethod
        ? `Your first charge is on ${until}.`
        : `Add a payment method before ${until} to keep your showroom online. You are not charged until then.`
    )
  }
  if (upcoming && dealer.nextPlanStartsAt) {
    lines.push(
      `Switching to ${PLANS[upcoming].label} on ${date(dealer.nextPlanStartsAt)}. Until then you keep ${PLANS[plan].label} (${PLANS[plan].maxLiveCars} cars).`
    )
  }
  if (state.cancelling && state.phase !== "suspended") {
    lines.push(
      `Your plan is cancelled. Your showroom stays online until ${until}, then goes offline. Restart below to keep it.`
    )
  }
  const status = {
    badge:
      state.cancelling && state.phase !== "suspended"
        ? "Cancelled"
        : BADGE[state.phase],
    tone: (state.cancelling && state.phase !== "suspended"
      ? "muted"
      : {
          free: "success",
          legacy: "primary",
          trial: "primary",
          active: "success",
          grace: "destructive",
          suspended: "destructive",
        }[state.phase]) as "success" | "primary" | "destructive" | "muted",
    headline,
    lines,
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Billing</h1>

        {problem ? (
          <Alert variant="destructive" className="max-w-2xl">
            <AlertTitle>Payment failed</AlertTitle>
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {ctx.devBypass ? (
        <p className="text-center text-sm text-muted-foreground">
          Payments are turned off in the local demo account.
        </p>
      ) : (
        <div className="flex flex-col items-center">
          <BillingPanel
            currentPlan={upcoming ?? plan}
            currentCycle={
              (dealer.nextBillingCycle ?? dealer.billingCycle) as BillingCycle
            }
            hasPaymentMethod={state.hasPaymentMethod}
            cancelling={state.cancelling}
            endsOn={state.accessUntil ? until : null}
            canManage={ctx.role === "owner"}
            statusPlan={plan}
            status={status}
            note="Upgrades start immediately and are charged now. A downgrade starts when your current period ends, so you keep what you paid for."
          />
        </div>
      )}
    </div>
  )
}
