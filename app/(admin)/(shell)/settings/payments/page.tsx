import { getVertical } from "@/lib/verticals"
import { redirect } from "next/navigation"

import { PaymentsPanel } from "@/components/settings/payments-panel"
import { SettingsPage } from "@/components/settings/settings-page"
import { getDealerContext } from "@/lib/auth/context"
import { getDealerRouteAccount } from "@/lib/tenant/route"

export const metadata = { title: "Payments" }

export default async function PaymentsSettingsPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")

  const what = getVertical(ctx.dealer.industry).paymentsPurpose
  if (!ctx.dealerInDb) {
    return (
      <SettingsPage title="Payments" description={`Connect your bank account so ${what}.`}>
        <p className="text-sm text-muted-foreground">Not available in the local demo account.</p>
      </SettingsPage>
    )
  }

  if (ctx.role !== "owner") {
    return (
      <SettingsPage title="Payments" description={`Connect your bank account so ${what}.`}>
        <p className="text-sm text-muted-foreground">Only the owner can manage payouts.</p>
      </SettingsPage>
    )
  }

  const account = await getDealerRouteAccount(ctx.dealer.id)

  return (
    <SettingsPage title="Payments" description={`Connect your bank account so ${what}, sent straight to you.`}>
      <PaymentsPanel
        status={account?.razorpayAccountStatus ?? null}
        legalName={ctx.dealer.displayName}
        email={ctx.user.email ?? ""}
        phone={ctx.dealer.phone ?? ""}
        city={ctx.dealer.city}
        purpose={what}
      />
    </SettingsPage>
  )
}
