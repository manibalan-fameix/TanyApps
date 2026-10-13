import { NotificationsPanel } from "@/components/restaurant/notifications-panel"
import { PageHeader } from "@/components/restaurant/page-header"
import { requireRestaurant } from "@/lib/restaurant/guard"

export const metadata = { title: "Notifications" }

export default async function NotificationsPage() {
  await requireRestaurant()
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <PageHeader title="Notifications" description="Live new-order alerts, from any page while you are signed in." />
      <NotificationsPanel />
    </div>
  )
}
