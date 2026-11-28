import { StorePage } from "@/components/restaurant/store/ui"
import { EnquiryForm } from "@/components/restaurant/forms"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Contact" }

export default async function ContactPage({ params, searchParams }: { params: Promise<{ dealer: string }>; searchParams: Promise<{ type?: string; item?: string }> }) {
  const { dealer } = await restaurantPage(params)
  const { type, item } = await searchParams
  const initialItem = typeof item === "string" ? item.slice(0, 80) : ""
  return (
    <StorePage className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contact {dealer.displayName}</h1>
        <p className="text-sm text-muted-foreground">{[dealer.city, dealer.phone].filter(Boolean).join(" · ")}</p>
      </div>
      {/* Keyed on the link's values, so following another request link from here starts the form again. */}
      <EnquiryForm key={`${type}:${initialItem}`} initialKind={type === "question" ? "question" : "product"} initialItem={initialItem} />
    </StorePage>
  )
}
