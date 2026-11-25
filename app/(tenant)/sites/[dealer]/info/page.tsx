import { InfoTabs } from "@/components/restaurant/store/info-tabs"
import { storeInfo, storeReviews } from "@/components/restaurant/store/home"
import { currentCustomer } from "@/lib/core/login/customer"
import { reviews } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { restaurantPage } from "@/lib/restaurant/page-data"
import { and, eq, isNull } from "drizzle-orm"

export const metadata = { title: "Store info" }
export const dynamic = "force-dynamic"

export default async function StoreInfoPage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer, store } = await restaurantPage(params)
  // Who can write a review: a signed-in customer who has not reviewed the shop yet. Anyone else is asked to sign in, or thanked.
  const customer = await currentCustomer(dealer.id)
  const reviewed = customer ? (await scopedDb(dealer.id).reviews.count(and(eq(reviews.customerId, customer.id), isNull(reviews.orderId)))) > 0 : false
  const write = !customer ? "signed-out" : reviewed ? "done" : "signed-in"
  return <InfoTabs info={storeInfo(dealer, store)} reviews={storeReviews(store)} rating={store.rating} write={write} />
}
