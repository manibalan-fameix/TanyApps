import { CabSettingsForm } from "@/components/cabs/settings-form"
import { PageHeader } from "@/components/restaurant/page-header"
import { loadPricing, settingsToForm } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "Fares, GST and rules" }
export const dynamic = "force-dynamic"

export default async function CabSettingsPage() {
  const { dealer, owner } = await requireIndustry("cabs")
  const { settingsRow } = await loadPricing(scopedDb(dealer.id))
  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <PageHeader title="Fares, GST and rules" description="The rules that decide a fare and a booking. Nothing is filled in for you: a blank stays blank until you decide." />
      <CabSettingsForm initial={settingsToForm(settingsRow)} owner={owner} />
    </div>
  )
}
