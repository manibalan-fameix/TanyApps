"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { BulkPhotos, type PhotoProduct } from "@/components/restaurant/bulk-photos"
import { CategoriesManager, CategoryDialogs, useCategoryDialogs } from "@/components/restaurant/categories-manager"
import { ImportWizard } from "@/components/restaurant/import-wizard"
import { MenuItemForm } from "@/components/restaurant/menu-item-form"
import { Button, buttonVariants } from "@/components/ui/button"
import { Popup } from "@/components/restaurant/popup"
import { cn } from "@/lib/utils"
import { storeTerms } from "@/lib/verticals/terms"

type Panel = "add" | "import" | "categories" | "photos"

/**
 * The page actions on the catalogue (Categories, Import, Add) open as centred pop-ups over the page, the same pop-up the row editor uses,
 * so nothing leaves the list and every action looks and behaves alike. Each panel is also still available as its own page.
 */
export function MenuActions({
  industry,
  businessType,
  categories,
  atLimit,
  sample,
  products,
}: {
  industry: string
  businessType: string | null
  categories: { id: string; name: string; itemCount: number }[]
  atLimit: boolean
  sample: { name: string; category: string; price: string }[]
  products: PhotoProduct[]
}) {
  const t = storeTerms(industry, businessType)
  const router = useRouter()
  const [panel, setPanel] = useState<Panel | null>(null)
  // The edit slider and delete confirmation for categories live here, beside the pop-up, so they sit cleanly on top of it.
  const catDialogs = useCategoryDialogs()
  const covered = catDialogs.renaming !== null || catDialogs.deleting !== null
  const close = () => {
    setPanel(null)
    router.refresh()
  }
  const article = t.item === "dish" ? "a dish" : `a ${t.item}`

  return (
    <>
      <Button variant="outline" onClick={() => setPanel("categories")}>Categories</Button>
      <Button variant="outline" onClick={() => setPanel("photos")}>Add photos</Button>
      {atLimit ? (
        <Link href="/settings/billing" className={cn(buttonVariants())}>Upgrade to add more</Link>
      ) : (
        <>
          <Button variant="outline" onClick={() => setPanel("import")}>Import</Button>
          <Button onClick={() => setPanel("add")}>Add {article}</Button>
        </>
      )}

      <Popup open={panel === "photos"} onOpenChange={(open) => !open && close()} title="Add photos" description={`Choose your own pictures. Name each file after its ${t.item} and it is matched for you; nothing is saved until you press Save.`} size="lg" keepOpenOnOutsideClick>
        {panel === "photos" ? <BulkPhotos products={products} itemNoun={t.item} onDone={close} /> : null}
      </Popup>

      <Popup open={panel === "add"} onOpenChange={(open) => !open && close()} title={`Add ${article}`} description={`It shows on your ${industry === "retail" ? "store" : "menu"} page as soon as you save.`}>
        {panel === "add" ? <MenuItemForm industry={industry} businessType={businessType} categories={categories.map((c) => ({ id: c.id, name: c.name }))} onDone={close} /> : null}
      </Popup>
      <Popup
        covered={covered}
        open={panel === "categories"}
        onOpenChange={(open) => !open && close()}
        title="Categories"
        description={industry === "retail" ? "Departments that group your products, like Rice & Grains or Snacks." : "Sections that group your dishes, like Starters or Biryani."}
      >
        {panel === "categories" ? <CategoriesManager industry={industry} businessType={businessType} categories={categories} dialogs={catDialogs} /> : null}
      </Popup>
      <Popup
        open={panel === "import"}
        onOpenChange={(open) => !open && close()}
        title={`Import ${t.items}`}
        description={`Add many ${t.items} at once from a spreadsheet, or let AI read a purchase invoice or stock report so you do not type them in.`}
      >
        {panel === "import" ? <ImportWizard itemNoun={t.item} itemsNoun={t.items} catalogue={t.catalogue} sample={sample} onFinished={close} /> : null}
      </Popup>
      <CategoryDialogs state={catDialogs} industry={industry} businessType={businessType} />
    </>
  )
}
