import { redirect } from "next/navigation"

import { HoursForm } from "@/components/settings/hours-form"
import { SettingsPage } from "@/components/settings/settings-page"
import { getDealerContext } from "@/lib/auth/context"

export const metadata = { title: "Business hours" }

export default async function HoursPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  const locked = ctx.role !== "owner" || !ctx.dealerInDb
  return (
    <SettingsPage
      title="Business hours"
      description="Buyers use these hours to book test drives."
      note={locked ? (ctx.dealerInDb ? "Only the owner can change these." : "Not available in the local demo account.") : undefined}
    >
      <HoursForm initial={ctx.dealer.businessHours} disabled={locked} />
    </SettingsPage>
  )
}
