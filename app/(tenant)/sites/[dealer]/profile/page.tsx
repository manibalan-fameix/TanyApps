import Link from "next/link"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, FavouriteIcon, Location01Icon, Settings01Icon, UserIcon } from "@hugeicons/core-free-icons"

import { ReviewForm } from "@/components/restaurant/forms"
import { SignOutButton } from "@/components/restaurant/store/sign-out-button"
import { StorePage } from "@/components/restaurant/store/ui"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { buttonVariants } from "@/components/ui/button"
import { decrypt } from "@/lib/crypto"
import { currentCustomer } from "@/lib/core/login/customer"
import { orders, reviews } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { orderPhoneHash } from "@/lib/restaurant/order-phone"
import { formatRupees } from "@/lib/restaurant/menu"
import { restaurantPage } from "@/lib/restaurant/page-data"

export const metadata = { title: "Profile" }
export const dynamic = "force-dynamic"

const LINKS = [
  { href: "/addresses", label: "Saved addresses", icon: Location01Icon },
  { href: "/favourites", label: "Saved items", icon: FavouriteIcon },
  { href: "/settings", label: "Settings", icon: Settings01Icon },
]

export default async function ProfilePage({ params }: { params: Promise<{ dealer: string }> }) {
  const { dealer } = await restaurantPage(params)
  const customer = await currentCustomer(dealer.id)
  const e164 = customer ? decrypt(customer.phoneEnc, dealer.id) : null
  const phone = e164 ? e164.replace(/^\+91/, "+91 ") : null
  const toReview = customer && e164 ? await ordersToReview(dealer.id, e164) : []

  return (
    <StorePage>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">Profile</h1>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarFallback>
              {customer?.name ? customer.name.charAt(0).toUpperCase() : <HugeiconsIcon icon={UserIcon} className="size-6" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{customer ? (customer.name || "Guest") : "You're not signed in"}</p>
            <p className="truncate text-sm text-muted-foreground">{phone ?? "Sign in to see your orders and saved items."}</p>
          </div>
        </div>

        {customer ? null : (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- API route that redirects to another host; <Link> cannot follow it
          <a href="/api/t/auth/start?next=%2Fprofile" className={buttonVariants({ size: "lg" })}>
            Sign in
          </a>
        )}

        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-colors hover:bg-muted">
                <HugeiconsIcon icon={l.icon} strokeWidth={2} className="size-5 text-muted-foreground" />
                <span className="flex-1">{l.label}</span>
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>

        {customer ? (
          <section aria-labelledby="rate-orders" className="flex flex-col gap-3">
            <h2 id="rate-orders" className="text-lg font-semibold">Rate your orders</h2>
            {toReview.length === 0 ? (
              <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">Once an order is delivered you can review it here. Reviews are shown on the shop page after the owner approves them.</p>
            ) : (
              toReview.map((o) => (
                <div key={o.id} className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    Order <span className="font-medium text-foreground">{o.code}</span> · {o.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {formatRupees(o.total)}
                    {o.summary ? <span className="block truncate">{o.summary}</span> : null}
                  </p>
                  <ReviewForm code={o.code} media />
                </div>
              ))
            )}
          </section>
        ) : null}

        {customer ? <SignOutButton /> : null}
      </div>
    </StorePage>
  )
}

/**
 * This customer's completed orders that have no review yet, newest first. Orders are matched on the phone number they were placed
 * with (by its keyed hash, or the plain number on an order not yet sealed), so only their own orders appear.
 */
async function ordersToReview(dealerId: string, e164: string) {
  const db = scopedDb(dealerId)
  const mine = await db.orders.select(
    and(eq(orders.status, "completed"), or(eq(orders.customerPhoneHash, orderPhoneHash(e164)), eq(orders.customerPhone, e164), eq(orders.customerPhone, e164.replace(/^\+91/, ""))))!,
    { orderBy: [desc(orders.createdAt)], limit: 10 },
  )
  if (mine.length === 0) return []
  const done = new Set((await db.reviews.select(inArray(reviews.orderId, mine.map((o) => o.id)))).map((r) => r.orderId))
  return mine.filter((o) => !done.has(o.id)).map((o) => ({ id: o.id, code: o.code, total: o.total, createdAt: o.createdAt, summary: o.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") }))
}
