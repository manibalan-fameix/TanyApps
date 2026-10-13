import { ServiceAreaForm } from "@/components/restaurant/service-area-form"
import { SettingsPage } from "@/components/settings/settings-page"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { readServiceArea } from "@/lib/restaurant/service-area"

export const metadata = { title: "Location and range" }
export const dynamic = "force-dynamic"

export default async function LocationSettingsPage() {
  const { dealer, owner } = await requireRestaurant()
  return (
    <SettingsPage
      title="Location and range"
      description="Where your restaurant is, and how far from it you deliver. Guests outside the range can still order pickup."
      note={owner ? undefined : "Only the owner can change these."}
    >
      <ServiceAreaForm initial={readServiceArea(dealer.serviceArea)} disabled={!owner} />
    </SettingsPage>
  )
}
