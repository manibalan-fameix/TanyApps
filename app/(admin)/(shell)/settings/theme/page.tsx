import { redirect } from "next/navigation"

import { SettingsPage } from "@/components/settings/settings-page"
import { ThemeForm } from "@/components/settings/theme-form"
import { getDealerContext } from "@/lib/auth/context"

export const metadata = { title: "Theme" }

export default async function ThemePage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") redirect("/login")
  const locked = ctx.role !== "owner" || !ctx.dealerInDb
  return (
    <SettingsPage
      title="Theme"
      description="Colours and corner style for your public showroom."
      note={locked ? (ctx.dealerInDb ? "Only the owner can change these." : "Not available in the local demo account.") : undefined}
    >
      <ThemeForm initial={ctx.dealer.theme} disabled={locked} />
    </SettingsPage>
  )
}
