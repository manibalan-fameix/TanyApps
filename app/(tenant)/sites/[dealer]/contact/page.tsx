import { notFound } from "next/navigation"

import { StorePage } from "@/components/restaurant/store/ui"
import { EnquiryForm } from "@/components/restaurant/forms"
import { getDealerBySlug } from "@/lib/tenant/dealer"

export const metadata = { title: "Contact" }

export default async function ContactPage({ params }: { params: Promise<{ dealer: string }> }) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer || dealer.industry !== "restaurants") notFound()
  return (
    <StorePage className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className=" text-2xl font-semibold tracking-tight">Contact {dealer.displayName}</h1>
        <p className="text-sm text-muted-foreground">{dealer.city}{dealer.phone ? ` · ${dealer.phone}` : ""}</p>
      </div>
      <EnquiryForm />
    </StorePage>
  )
}
