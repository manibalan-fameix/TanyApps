import { notFound } from "next/navigation"

import { TableBookingForm } from "@/components/restaurant/forms"
import { StorePage } from "@/components/restaurant/store/ui"
import { getDealerBySlug } from "@/lib/tenant/dealer"

export const metadata = { title: "Book a table" }

export default async function BookTablePage({ params }: { params: Promise<{ dealer: string }> }) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer || dealer.industry !== "restaurants") notFound()
  return (
    <StorePage className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Book a table at {dealer.displayName}</h1>
        <p className="text-sm text-muted-foreground">Tell us when you are coming and we will call to confirm.{dealer.phone ? ` · ${dealer.phone}` : ""}</p>
      </div>
      <TableBookingForm />
    </StorePage>
  )
}
