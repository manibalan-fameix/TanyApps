import { TrackForm } from "@/components/restaurant/store/track-form"
import { StorePage } from "@/components/restaurant/store/ui"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Track order" }

export default async function TrackOrderPage({ params }: { params: Promise<{ dealer: string }> }) {
  await restaurantPage(params)
  return (
    <StorePage>
      <h1 className="text-3xl font-semibold tracking-tight">Track your order</h1>
      <p className="mt-2 mb-6 text-sm text-muted-foreground">Enter the 6-character code you got when you placed your order.</p>
      <TrackForm />
    </StorePage>
  )
}
