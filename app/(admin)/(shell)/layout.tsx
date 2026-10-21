import { redirect } from "next/navigation"

import { AdminMobileNav } from "@/components/admin/mobile-nav"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { desc } from "drizzle-orm"

import { OrderAlertsBell, OrderAlertsProvider } from "@/components/restaurant/order-alerts"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { UploadProvider } from "@/components/capture/upload-provider"
import { AppSidebar } from "@/components/app-sidebar"
import type { RecentCar } from "@/components/nav-projects"
import { ThemeToggle } from "@/components/theme-toggle"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { copy } from "@/lib/copy"
import { getDealerContext } from "@/lib/auth/context"
import { cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { tenantUrl } from "@/lib/env"
import Link from "next/link"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { IndustryKey } from "@/lib/industries"
import { billingState, effectivePlanKey } from "@/lib/billing/state"
import { bookingsBanner, bookingsUsage } from "@/lib/cabs/limits"
import { monthlyBookingCount, recordBookingsThreshold } from "@/lib/cabs/usage"

const DEMO_CARS = [
  { id: "demo-1", year: 2017, regPrefix: "tn11", shortCode: "k7x2m" },
  { id: "demo-2", year: 2019, regPrefix: "tn09", shortCode: "p4d8q" },
  { id: "demo-3", year: 2015, regPrefix: "tn22", shortCode: "w3n6r" },
]

// Signed-in area. Authorization happens here on the server, not in the proxy.
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getDealerContext()
  if (ctx.status === "anonymous") redirect("/login")
  if (ctx.status === "no-dealer") redirect("/onboarding")

  const dealerName = ctx.status === "ok" ? ctx.dealer.displayName : copy.brand.name
  const planLabel = ctx.status === "ok" ? ctx.plan.label : ""
  const publicUrl = ctx.status === "ok" ? tenantUrl(ctx.dealer.slug) : "/"
  const user = { name: ctx.user.name ?? "", email: ctx.user.email ?? "" }

  let recentCars: RecentCar[] = []
  if (ctx.status === "ok") {
    const rows = !ctx.dealerInDb
      ? DEMO_CARS
      : await scopedDb(ctx.dealer.id).cars.select(undefined, { orderBy: [desc(cars.listedAt)], limit: 4 })
    // Only id, year, plate prefix and short code go to the client. Never the encrypted reg number.
    recentCars = rows.map((c) => ({
      id: c.id,
      name: `${c.year} ${(c.regPrefix ?? "").toUpperCase()}`.trim(),
      shareUrl: `${publicUrl}${c.shortCode}`,
    }))
  }

  const billing = ctx.status === "ok" && ctx.dealerInDb ? billingState(ctx.dealer) : null
  const banner =
    billing?.phase === "suspended"
      ? { title: "Your showroom is offline", body: "Your free trial has ended. Add a payment method to bring it back online.", destructive: true }
      : billing?.phase === "grace"
        ? { title: "Payment pending", body: "We could not collect your last payment. Your showroom stays online for a few days while we retry.", destructive: false }
        : billing?.paymentIssue
          ? { title: "Your last payment failed", body: "Add a payment method again so your showroom is not taken offline.", destructive: true }
          : billing?.cancelling && billing.accessUntil
            ? { title: "Your plan is cancelled", body: `Your showroom stays online until ${billing.accessUntil.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, then goes offline.`, destructive: false }
        : billing?.phase === "trial" && !billing.hasPaymentMethod && billing.daysLeft <= 7
          ? { title: `${billing.daysLeft} ${billing.daysLeft === 1 ? "day" : "days"} left in your free trial`, body: "Add a payment method to keep your showroom online. You are not charged until the trial ends.", destructive: false }
          : null

  // Cab operators see how much of the month's bookings allowance is used. It is a soft limit: customers are never turned away.
  let cabsBanner: ReturnType<typeof bookingsBanner> = null
  if (ctx.status === "ok" && ctx.dealerInDb && ctx.dealer.industry === "cabs") {
    const now = new Date()
    const db = scopedDb(ctx.dealer.id)
    const usage = bookingsUsage(await monthlyBookingCount(db, now), effectivePlanKey(ctx.dealer))
    cabsBanner = bookingsBanner(usage)
    await recordBookingsThreshold(db, usage, now).catch(() => false)
  }

  const restaurant = ctx.status === "ok" && ctx.dealer.industry === "restaurants"
  const shell = (
    <SidebarProvider>
      <AppSidebar dealerName={dealerName} dealerLogoUrl={ctx.status === "ok" ? ctx.dealer.logoUrl : null} planLabel={planLabel} publicUrl={publicUrl} user={user} recentCars={recentCars} industry={ctx.status === "ok" ? (ctx.dealer.industry as IndustryKey) : undefined} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur max-md:border-b max-md:border-border md:static md:h-16 md:bg-transparent md:pt-0 md:backdrop-blur-none">
          <div className="flex items-center gap-2 px-4 md:px-10">
            <SidebarTrigger className="-ml-1 max-md:hidden" />
            <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto max-md:hidden" />
            <AdminBreadcrumb dealerName={dealerName} />
          </div>
          <div className="ml-auto flex items-center gap-1 px-4 md:px-10">
            {restaurant ? <OrderAlertsBell /> : null}
            <ThemeToggle />
          </div>
        </header>
        {/* Uploads run for the whole admin session, so they carry on while the dealer navigates. */}
        <UploadProvider>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-10 md:pt-0 md:pb-8">
            {banner ? (
              <Alert variant={banner.destructive ? "destructive" : "default"}>
                <AlertTitle>{banner.title}</AlertTitle>
                <AlertDescription>
                  {banner.body}{" "}
                  <Link href="/settings/billing" className="font-medium underline">
                    Open billing
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
            {cabsBanner ? (
              <Alert variant={cabsBanner.tone === "destructive" ? "destructive" : "default"}>
                <AlertTitle>{cabsBanner.title}</AlertTitle>
                <AlertDescription>
                  {cabsBanner.body}{" "}
                  <Link href="/settings/billing" className="font-medium underline">
                    See plans
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
            {children}
          </div>
        </UploadProvider>
      </SidebarInset>
      <PullToRefresh />
      <AdminMobileNav publicUrl={publicUrl} industry={ctx.status === "ok" ? (ctx.dealer.industry as IndustryKey) : undefined} />
    </SidebarProvider>
  )
  // Restaurants hear about new orders on every page, not only on the Orders screen.
  return restaurant ? <OrderAlertsProvider>{shell}</OrderAlertsProvider> : shell
}
