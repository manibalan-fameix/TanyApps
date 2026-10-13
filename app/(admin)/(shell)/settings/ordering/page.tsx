import { OrderSettingsForm } from "@/components/restaurant/simple-forms"
import { SettingsPage } from "@/components/settings/settings-page"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { onlinePaymentsAvailable } from "@/lib/restaurant/payments"
import { readOrderSettings } from "@/lib/restaurant/settings"

export const metadata = { title: "Ordering" }
export const dynamic = "force-dynamic"

export default async function OrderingSettingsPage() {
  const { dealer, owner } = await requireRestaurant()
  return (
    <SettingsPage
      title="Ordering"
      description="Choose how guests can order, and set your delivery fee and minimum order."
      note={owner ? undefined : "Only the owner can change these."}
    >
      <OrderSettingsForm initial={readOrderSettings(dealer.orderSettings)} disabled={!owner} onlineReady={onlinePaymentsAvailable(dealer)} />
    </SettingsPage>
  )
}
