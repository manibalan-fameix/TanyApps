import { notFound } from "next/navigation"

import { getDealerBySlug } from "../tenant/dealer"
import { loadStorefront } from "./storefront-data"
import { isOrderIndustry } from "../verticals"

/** Dealer and storefront for a public restaurant page, or a 404 for any other kind of business. */
export async function restaurantPage(params: Promise<{ dealer: string }>) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer || !isOrderIndustry(dealer.industry)) notFound()
  return { dealer, store: await loadStorefront(dealer) }
}
