import { ImportWizard } from "@/components/restaurant/import-wizard"
import { SettingsPage } from "@/components/settings/settings-page"
import { requireRestaurant } from "@/lib/restaurant/guard"
import { getRetailType, storeTerms } from "@/lib/verticals"

export const metadata = { title: "Import products" }
export const dynamic = "force-dynamic"

export default async function ImportPage() {
  const { dealer } = await requireRestaurant()
  const t = storeTerms(dealer.industry, dealer.businessType)
  const sample =
    dealer.industry === "retail"
      ? getRetailType(dealer.businessType).previewItems.slice(0, 3).map((p, i) => ({ name: p.name, category: getRetailType(dealer.businessType).starterCategories[i] ?? "", price: p.price }))
      : [
          { name: "Chicken Biryani", category: "Biryani", price: "250" },
          { name: "Paneer Butter Masala", category: "Mains", price: "240" },
        ]
  return (
    <SettingsPage title={`Import ${t.items}`} description={`Add many ${t.items} at once from a spreadsheet, or let AI read a purchase invoice or stock report so you do not type them in.`}>
      <ImportWizard itemNoun={t.item} itemsNoun={t.items} catalogue={t.catalogue} sample={sample} />
    </SettingsPage>
  )
}
