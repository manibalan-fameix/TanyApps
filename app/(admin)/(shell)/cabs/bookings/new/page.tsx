import { ManualBookingForm } from "@/components/cabs/manual-booking"
import { PageHeader } from "@/components/restaurant/page-header"
import { classOptions, loadClasses } from "@/lib/cabs/page-data"
import { loadBookingOptions } from "@/lib/cabs/trip-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"

export const metadata = { title: "New booking" }
export const dynamic = "force-dynamic"

export default async function NewBooking() {
  const { dealer } = await requireIndustry("cabs")
  const db = scopedDb(dealer.id)
  const [classes, options] = await Promise.all([loadClasses(db), loadBookingOptions(db, new Date())])
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader title="New booking" description="For a customer who phones or walks in. The fare is worked out the same way as on your website." />
      <ManualBookingForm classes={classOptions(classes.filter((c) => c.active))} localPackages={options.localPackages} tours={options.tours} />
    </div>
  )
}
