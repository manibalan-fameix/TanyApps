import { SettingsForm } from "@/components/restaurant/store/settings-form"
import { StorePage } from "@/components/restaurant/store/ui"
import { currentCustomer } from "@/lib/core/login/customer"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Settings" }
export const dynamic = "force-dynamic"

export default async function SettingsPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer } = await restaurantPage(params)
  const customer = await currentCustomer(dealer.id)
  return (
    <StorePage>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Settings</h1>
      <SettingsForm signedIn={!!customer} />
    </StorePage>
  )
}
