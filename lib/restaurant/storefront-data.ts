import { asc, desc, eq } from "drizzle-orm"
import { cache } from "react"

import { banners, coupons, deliveryZones, menuCategories, menuItems, reviews } from "../db/schema"
import { scopedDb } from "../db/scoped"
import type { DealerProfile } from "../tenant/dealer"
import { readProfile } from "./profile"
import { readServiceArea } from "./service-area"
import { enabledFulfilments, paymentOptions, readOrderSettings } from "./settings"
import { expireUnpaidOrders, onlinePaymentsAvailable, usingTestKeys } from "./payments"
import { type StoreCategory, type StoreDish, categorySlugs } from "./storefront"

/** Everything the public pages need, loaded once per request and always scoped to this restaurant. */
export const loadStorefront = cache(async (dealer: DealerProfile) => {
  // Unpaid online orders release their stock before the menu is read, so a dish is never held by an abandoned checkout.
  await expireUnpaidOrders(dealer.id)
  const db = scopedDb(dealer.id)
  const [items, cats, bannerRows, reviewRows, couponRows, zoneCount] = await Promise.all([
    db.menuItems.select(undefined, { orderBy: [desc(menuItems.isFeatured), asc(menuItems.sortOrder), asc(menuItems.name)] }),
    db.menuCategories.select(undefined, { orderBy: [asc(menuCategories.sortOrder)] }),
    db.banners.select(eq(banners.isActive, true), { orderBy: [asc(banners.sortOrder)], limit: 5 }),
    db.reviews.select(eq(reviews.status, "approved"), { orderBy: [desc(reviews.createdAt)], limit: 12 }),
    db.coupons.select(eq(coupons.isActive, true), { orderBy: [desc(coupons.createdAt)], limit: 12 }),
    db.deliveryZones.count(eq(deliveryZones.isActive, true)),
  ])
  const now = Date.now()
  const slugs = categorySlugs(cats)
  const name = new Map(cats.map((c) => [c.id, c.name]))
  const dishes: StoreDish[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    price: i.price,
    compareAt: i.compareAtPrice,
    portions: i.portions,
    imageUrl: i.imageUrl,
    isVeg: i.isVeg,
    isAvailable: i.isAvailable,
    isFeatured: i.isFeatured,
    categoryId: i.categoryId && name.has(i.categoryId) ? i.categoryId : null,
    categoryName: (i.categoryId && name.get(i.categoryId)) || "",
  }))
  const categories: StoreCategory[] = cats
    .map((c) => ({ id: c.id, name: c.name, slug: slugs.get(c.id) ?? c.id, count: dishes.filter((d) => d.categoryId === c.id).length }))
    .filter((c) => c.count > 0)
  const settings = readOrderSettings(dealer.orderSettings)
  const average = reviewRows.length ? reviewRows.reduce((n, r) => n + r.rating, 0) / reviewRows.length : null
  return {
    dishes,
    categories,
    banners: bannerRows,
    reviews: reviewRows,
    coupons: couponRows
      .filter((c) => !c.expiresAt || c.expiresAt.getTime() > now)
      .map((c) => ({
        code: c.code,
        offer: c.kind === "percent" ? `${c.value}% off${c.maxDiscount ? ` up to ₹${c.maxDiscount}` : ""}` : `₹${c.value} off`,
        minOrder: c.minOrder,
        expires: c.expiresAt,
      })),
    rating: average === null ? null : { value: Math.round(average * 10) / 10, count: reviewRows.length },
    settings,
    /** Where the restaurant is and how far it delivers, for directions and the checkout. */
    serviceArea: readServiceArea(dealer.serviceArea),
    /** What a guest can choose at checkout right now. */
    paymentMethods: paymentOptions(settings, onlinePaymentsAvailable(dealer)),
    /** Razorpay test keys are in use: no real money moves, and the checkout shows how to complete a test payment. */
    testPayments: usingTestKeys(),
    /** True once the owner has set up delivery zones: delivery then needs a pincode inside one. */
    zonesEnabled: zoneCount > 0,
    canOrder: settings.acceptingOrders && enabledFulfilments(settings).length > 0,
    profile: readProfile(dealer.profile),
  }
})

export type Storefront = Awaited<ReturnType<typeof loadStorefront>>
