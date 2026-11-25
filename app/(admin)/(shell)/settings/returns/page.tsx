import { asc } from "drizzle-orm"

import { ReturnSettingsForm } from "@/components/returns/settings-form"
import { SettingsPage } from "@/components/settings/settings-page"
import { menuCategories } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { REASONS, readReturnSettings, reasonsFor } from "@/lib/returns/rules"

export const metadata = { title: "Returns" }
export const dynamic = "force-dynamic"

export default async function ReturnSettingsPage() {
  const { dealer, owner } = await requireRestaurant()
  const categories = await scopedDb(dealer.id).menuCategories.select(undefined, { orderBy: [asc(menuCategories.name)] })
  const settings = readReturnSettings(dealer.profile)
  return (
    <SettingsPage title="Returns" description="Choose what customers can report, and how long they have." note={owner ? undefined : "Only the owner can change these."}>
      <ReturnSettingsForm
        initial={settings}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        reasons={reasonsFor(dealer.industry, { ...settings, reasons: [...REASONS] })}
        industry={dealer.industry}
        disabled={!owner}
      />
    </SettingsPage>
  )
}
