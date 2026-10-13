"use client"

import { Button } from "@/components/ui/button"
import {
  BILLING_CYCLES,
  PLANS,
  SIGNUP_PLAN_KEYS,
  YEARLY_PAID_MONTHS,
  planLimitLabel,
  planPrice,
  type BillingCycle,
  type SignupPlanKey,
} from "@/lib/plans"
import { cn } from "@/lib/utils"

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`

export function PlanPicker({
  plan,
  cycle,
  onPlan,
  onCycle,
  industry = "motors",
}: {
  plan: SignupPlanKey
  cycle: BillingCycle
  onPlan: (p: SignupPlanKey) => void
  onCycle: (c: BillingCycle) => void
  industry?: string
}) {
  return (
    <>
      {plan === "free" ? null : (
        <div
          className="grid grid-cols-2 gap-1 rounded-lg border p-1"
          role="group"
          aria-label="Billing period"
        >
          {BILLING_CYCLES.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={cycle === c ? "default" : "ghost"}
              aria-pressed={cycle === c}
              onClick={() => onCycle(c)}
            >
              {c === "monthly" ? "Monthly" : "Yearly · 1 month free"}
            </Button>
          ))}
        </div>
      )}
      <div className="grid gap-3" role="radiogroup" aria-label="Plan">
        {SIGNUP_PLAN_KEYS.map((key) => {
          const p = PLANS[key]
          const selected = plan === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPlan(key)}
              className={cn(
                "flex items-center justify-between gap-4 rounded-lg border p-4 text-left",
                selected && "border-primary ring-2 ring-primary"
              )}
            >
              <span className="grid gap-0.5">
                <span className="font-semibold">{p.label}</span>
                <span className="text-sm text-muted-foreground">
                  {planLimitLabel(industry, key)}
                </span>
                {key === "free" ? (
                  <span className="text-xs text-success">
                    No card needed. Upgrade any time.
                  </span>
                ) : cycle === "yearly" ? (
                  <span className="text-xs text-success">
                    Pay for {YEARLY_PAID_MONTHS} months, get 12
                  </span>
                ) : null}
              </span>
              <span className="text-right">
                <span className="block text-lg font-bold">
                  {key === "free" ? "₹0" : rupees(planPrice(key, cycle))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {key === "free"
                    ? "forever"
                    : `per ${cycle === "yearly" ? "year" : "month"}`}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
