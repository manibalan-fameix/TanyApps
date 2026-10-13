import { ProfileForm } from "@/components/restaurant/simple-forms"
import { SettingsPage } from "@/components/settings/settings-page"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { readProfile } from "@/lib/restaurant/profile"

export const metadata = { title: "Storefront" }
export const dynamic = "force-dynamic"

export default async function StorefrontSettingsPage() {
  const { dealer, owner } = await requireRestaurant()
  return (
    <SettingsPage
      title="Storefront"
      description="The words and contact details guests see on your menu page. Your logo and colours are under Theme."
      note={owner ? undefined : "Only the owner can change these."}
    >
      <ProfileForm initial={readProfile(dealer.profile)} disabled={!owner} />
    </SettingsPage>
  )
}
