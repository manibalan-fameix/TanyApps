import Link from "next/link"

import { PricingSection } from "@/components/site/pricing-section"
import { SiteShell } from "@/components/site/site-shell"
import { TRIAL_DAYS } from "@/lib/plans"

export const metadata = { title: "Pricing | Tany" }

export default function Page() {
  return (
    <SiteShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-muted-foreground">Software subscription plans, priced in Indian rupees. Choose your type of business.</p>
        </div>
        <PricingSection />
        <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center text-sm text-muted-foreground">
          <p>
            Every plan is online software. Nothing is shipped. Paid plans start with a {TRIAL_DAYS}-day free trial, then renew automatically each month or year once you authorise a payment method. You can cancel at any time.
          </p>
          <p>
            Read our{" "}
            <Link className="underline" href="/refund-policy">refunds and cancellation policy</Link>,{" "}
            <Link className="underline" href="/delivery-policy">shipping and delivery policy</Link> and{" "}
            <Link className="underline" href="/terms">terms of service</Link>.
          </p>
        </div>
      </div>
    </SiteShell>
  )
}
