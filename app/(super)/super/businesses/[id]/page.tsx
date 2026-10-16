import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft01Icon,
  Car01Icon,
  ChartLineData01Icon,
  CheckmarkBadge01Icon,
  ShoppingBag01Icon,
  StarIcon,
  UserMultiple02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { DealerMark } from "@/components/dealer-mark"
import { LinkTabs } from "@/components/super/link-tabs"
import {
  FunnelCard,
  HealthBadge,
  ListCard,
  Metric,
  MixCard,
} from "@/components/super/metrics"
import { PageHeader, EmptyState } from "@/components/restaurant/page-header"
import {
  BookingsGrid,
  CarsGrid,
  CouponsGrid,
  CustomersGrid,
  EnquiriesGrid,
  LeadsGrid,
  MenuGrid,
  OrdersGrid,
  PartnersGrid,
  ReviewsGrid,
  ZonesGrid,
} from "@/components/super/super-grids"
import { TrendChart } from "@/components/super/super-charts"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getPlan } from "@/lib/plans"
import { tenantUrl } from "@/lib/env"
import {
  loadBookings,
  loadBusiness,
  loadCars,
  loadLeads,
  loadOrders,
} from "@/lib/super/data"
import {
  PHASE_LABEL,
  fmtDate,
  fmtDateTime,
  label,
  money,
  num,
  rupees,
} from "@/lib/super/format"
import {
  loadBanners,
  loadBusinessInsights,
  loadCategories,
  loadCoupons,
  loadCustomers,
  loadEnquiries,
  loadMenu,
  loadPartners,
  loadReviews,
  loadZones,
} from "@/lib/super/queries"
import { cn } from "@/lib/utils"

export const metadata = { title: "Business" }

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium break-words">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

const text = (v: unknown) =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : ""

/** Settings stored as JSON, laid out as label and value. Nested values are shown as compact JSON. */
function settingsFacts(
  obj: Record<string, unknown> | null | undefined
): [string, React.ReactNode][] {
  return Object.entries(obj ?? {})
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => [
      label(k.replace(/([A-Z])/g, " $1").toLowerCase()),
      typeof v === "object" ? (
        <code key={k} className="text-xs break-all">
          {JSON.stringify(v)}
        </code>
      ) : (
        String(v)
      ),
    ])
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{hint}</CardDescription>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; days?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const b = await loadBusiness(id)
  if (!b) notFound()
  const r = b.row
  const restaurant = r.industry === "restaurants"
  const url = tenantUrl(r.slug)
  const plan = getPlan(r.plan)

  const tabs = restaurant
    ? [
        { key: "overview", label: "Overview" },
        { key: "orders", label: "Orders", count: r.orders },
        { key: "menu", label: "Menu", count: r.menuItems },
        { key: "customers", label: "Customers" },
        { key: "delivery", label: "Delivery" },
        { key: "feedback", label: "Reviews & enquiries", count: r.reviews },
        { key: "marketing", label: "Offers & banners" },
        { key: "profile", label: "Profile & settings" },
        { key: "billing", label: "Billing" },
        { key: "team", label: "Team" },
      ]
    : [
        { key: "overview", label: "Overview" },
        { key: "catalog", label: "Cars", count: r.totalCars },
        { key: "leads", label: "Leads", count: r.leads },
        { key: "bookings", label: "Bookings" },
        { key: "profile", label: "Profile & settings" },
        { key: "billing", label: "Billing" },
        { key: "team", label: "Team" },
      ]
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : "overview"
  const base = `/super/businesses/${id}`

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title={r.name}
        description={`${label(r.industry)} · ${r.city} · joined ${fmtDate(r.createdAt)} · last active ${r.lastActivityAt ? fmtDate(r.lastActivityAt) : "never"}`}
      >
        <Link
          href="/super/businesses"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          All businesses
        </Link>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants())}
        >
          Open public page
        </a>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <DealerMark name={r.name} logoUrl={b.logoUrl} />
        <Badge variant="secondary">{r.planLabel}</Badge>
        <Badge
          variant={
            r.phase === "active"
              ? "default"
              : r.phase === "suspended"
                ? "destructive"
                : "secondary"
          }
        >
          {PHASE_LABEL[r.phase] ?? r.phase}
        </Badge>
        <HealthBadge health={r.health} />
        {r.rating ? (
          <Badge variant="outline">
            {r.rating} ★ · {r.reviews} reviews
          </Badge>
        ) : null}
        <span className="text-sm text-muted-foreground">
          {r.mrr ? `${rupees(r.mrr)} / month` : "No recurring revenue"}
        </span>
      </div>

      <LinkTabs tabs={tabs} active={tab} base={base} />

      {tab === "overview" ? (
        <Overview
          id={id}
          restaurant={restaurant}
          days={Number(sp.days) === 90 ? 90 : Number(sp.days) === 7 ? 7 : 30}
          r={r}
          plan={plan.maxLiveCars}
        />
      ) : null}
      {tab === "orders" ? (
        <OrdersGrid rows={await loadOrders(id)} scoped dealerId={id} />
      ) : null}
      {tab === "menu" ? <MenuTab id={id} /> : null}
      {tab === "customers" ? <CustomersTab id={id} /> : null}
      {tab === "delivery" ? <DeliveryTab id={id} /> : null}
      {tab === "feedback" ? <FeedbackTab id={id} /> : null}
      {tab === "marketing" ? <MarketingTab id={id} /> : null}
      {tab === "catalog" ? (
        <CarsGrid rows={await loadCars(id)} scoped dealerId={id} />
      ) : null}
      {tab === "leads" ? (
        <LeadsGrid rows={await loadLeads(id)} scoped dealerId={id} />
      ) : null}
      {tab === "bookings" ? (
        <BookingsGrid rows={await loadBookings(id)} scoped dealerId={id} />
      ) : null}

      {tab === "profile" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Business details" hint="Who they are">
            <Facts
              items={[
                ["Name", r.name],
                ["Industry", label(r.industry)],
                ["Public address", url],
                ["Phone", r.phone],
                ["City", r.city],
                ["Email", text(b.profile.email)],
                ["Address", text(b.profile.address)],
                ["Tagline", text(b.profile.tagline)],
                ["Business ID", r.id],
                ["Joined", fmtDateTime(r.createdAt)],
              ]}
            />
          </Panel>
          <Panel title="Domains" hint="Where their page lives">
            <div className="flex flex-col divide-y text-sm">
              <div className="flex items-center justify-between gap-3 py-2">
                <span className="truncate font-medium">{url}</span>
                <Badge variant="secondary">Default</Badge>
              </div>
              {b.domains.map((d) => (
                <div
                  key={d.hostname}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="truncate font-medium">{d.hostname}</span>
                  <Badge variant={d.verified ? "default" : "secondary"}>
                    {d.verified ? "Verified" : "Not verified"}
                  </Badge>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Storefront text" hint="Shown on their public page">
            <Facts items={settingsFacts(b.profile)} />
          </Panel>
          {restaurant ? (
            <Panel title="Ordering rules" hint="Fees, minimums, timings">
              <Facts items={settingsFacts(b.orderSettings)} />
            </Panel>
          ) : (
            <Panel title="Business hours" hint="Used for test-drive slots">
              <Facts
                items={settingsFacts(
                  b.businessHours as Record<string, unknown> | null
                )}
              />
            </Panel>
          )}
          {restaurant ? (
            <Panel title="Service area" hint="Where they deliver">
              <Facts items={settingsFacts(b.serviceArea)} />
            </Panel>
          ) : null}
          <Panel title="Theme" hint="Colours and shape of their page">
            <Facts items={settingsFacts(b.theme)} />
          </Panel>
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Plan & billing" hint="What they pay">
            <Facts
              items={[
                ["Plan", r.planLabel],
                ["Cycle", label(r.billingCycle)],
                ["Status", PHASE_LABEL[r.phase] ?? r.phase],
                ["Monthly revenue", r.mrr ? rupees(r.mrr) : ""],
                ["Trial ends", fmtDate(r.trialEndsAt)],
                ["Paid through", fmtDate(r.paidThrough)],
                [
                  "Subscription",
                  r.subscriptionStatus ? label(r.subscriptionStatus) : "",
                ],
                ["Subscription ID", b.subscriptionId],
                ["Cancel requested", fmtDate(b.cancelRequestedAt)],
                [
                  "Next plan",
                  b.nextPlan
                    ? `${label(b.nextPlan)} from ${fmtDate(b.nextPlanStartsAt)}`
                    : "",
                ],
              ]}
            />
          </Panel>
          <Panel title="Plan limits" hint={`What ${r.planLabel} allows`}>
            <Facts
              items={[
                [
                  restaurant ? "Menu items" : "Cars live at once",
                  restaurant
                    ? String(r.menuItems)
                    : `${r.liveCars} of ${plan.maxLiveCars}`,
                ],
                ["White label", plan.whiteLabel ? "Yes" : "No"],
                ["Custom domain", plan.customDomain ? "Yes" : "No"],
                ["Add a car by voice", plan.voiceEntry ? "Yes" : "No"],
              ]}
            />
          </Panel>
          <Panel title="Payouts" hint="Where buyer payments are sent">
            <Facts
              items={[
                ["Razorpay account", b.razorpayAccountId],
                [
                  "Account status",
                  r.razorpayStatus ? label(r.razorpayStatus) : "Not linked",
                ],
                [
                  "Booking tokens collected",
                  r.bookingValue ? rupees(r.bookingValue) : "",
                ],
                ["Order sales", r.orderValue ? rupees(r.orderValue) : ""],
              ]}
            />
          </Panel>
          <Panel title="Timeline" hint="Account milestones">
            <div className="flex flex-col divide-y text-sm">
              {(
                [
                  [r.createdAt, "Joined Tany"],
                  [r.trialEndsAt, "Free trial ends"],
                  [b.cancelRequestedAt, "Cancellation requested"],
                  [
                    b.nextPlanStartsAt,
                    b.nextPlan ? `Switches to ${label(b.nextPlan)}` : null,
                  ],
                  [r.paidThrough, "Paid through"],
                ] as [string | null, string | null][]
              )
                .filter(([d, t]) => d && t)
                .sort((a, c) => a[0]!.localeCompare(c[0]!))
                .map(([d, t]) => (
                  <div
                    key={t}
                    className="flex items-center justify-between py-2"
                  >
                    <span>{t}</span>
                    <span className="text-muted-foreground">{fmtDate(d)}</span>
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === "team" ? (
        <Panel
          title="Team"
          hint={`${b.team.length} ${b.team.length === 1 ? "person" : "people"} can sign in`}
        >
          <div className="flex flex-col divide-y text-sm">
            {b.team.length === 0 ? (
              <p className="text-muted-foreground">No team members.</p>
            ) : null}
            {b.team.map((t) => (
              <div
                key={t.email || t.phone}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {t.name || t.email || t.phone}
                  </p>
                  <p className="truncate text-muted-foreground">
                    {[t.email, t.phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge variant={t.role === "owner" ? "default" : "secondary"}>
                  {t.role}
                </Badge>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

async function Overview({
  id,
  restaurant,
  days,
  r,
  plan,
}: {
  id: string
  restaurant: boolean
  days: number
  r: import("@/lib/super/data").BusinessRow
  plan: number
}) {
  const i = await loadBusinessInsights(id, days)
  const quiet = !i.series.some((s) => s.leads + s.orders + s.bookings > 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end gap-1 text-sm">
        {[7, 30, 90].map((d) => (
          <Link
            key={d}
            href={`/super/businesses/${id}?days=${d}`}
            className={cn(
              buttonVariants({
                size: "sm",
                variant: d === days ? "default" : "ghost",
              })
            )}
          >
            {d} days
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {restaurant ? (
          <>
            <Metric
              icon={Wallet01Icon}
              label="Sales"
              value={money(i.totals.gmv.value)}
              delta={i.totals.gmv.delta}
              note={`All time ${money(r.orderValue)}`}
            />
            <Metric
              icon={ShoppingBag01Icon}
              label="Orders"
              value={num(i.totals.orders.value)}
              delta={i.totals.orders.delta}
              note={`${num(r.orders)} all time`}
            />
            <Metric
              icon={ChartLineData01Icon}
              label="Average order"
              value={rupees(i.totals.aov.value)}
              delta={i.totals.aov.delta}
            />
            <Metric
              icon={UserMultiple02Icon}
              label="Guests"
              value={num(i.customers)}
              note={
                i.repeatRate != null
                  ? `${i.repeatRate}% order again`
                  : undefined
              }
            />
            <Metric
              icon={CheckmarkBadge01Icon}
              label="Cancelled orders"
              value={i.cancelRate != null ? `${i.cancelRate}%` : "—"}
              invert
            />
            <Metric
              icon={StarIcon}
              label="Rating"
              value={i.rating.avg ? `${i.rating.avg} ★` : "—"}
              note={`${i.rating.count} reviews · ${i.rating.pending} waiting for approval`}
            />
            <Metric
              icon={Car01Icon}
              label="Menu items"
              value={num(r.menuItems)}
            />
            <Metric
              icon={Wallet01Icon}
              label="Monthly revenue to Tany"
              value={r.mrr ? rupees(r.mrr) : "—"}
              note={r.phase === "free" ? r.planLabel : `${r.planLabel} · ${PHASE_LABEL[r.phase]}`}
            />
          </>
        ) : (
          <>
            <Metric
              icon={UserMultiple02Icon}
              label="Leads"
              value={num(i.totals.leads.value)}
              delta={i.totals.leads.delta}
              note={`${num(r.leads)} all time`}
            />
            <Metric
              icon={CheckmarkBadge01Icon}
              label="Win rate"
              value={i.winRate != null ? `${i.winRate}%` : "—"}
              note="Won of won + lost"
            />
            <Metric
              icon={Car01Icon}
              label="Cars live"
              value={`${r.liveCars} of ${plan}`}
              note={`${r.soldCars} sold · ${r.totalCars} listed`}
            />
            <Metric
              icon={Wallet01Icon}
              label="Stock value"
              value={money(i.stockValue)}
              note="Asking price of live cars"
            />
            <Metric
              icon={ChartLineData01Icon}
              label="Days to sell"
              value={i.avgDaysToSell != null ? `${i.avgDaysToSell}` : "—"}
              note="Average, listed to sold"
            />
            <Metric
              icon={Wallet01Icon}
              label="Sold value"
              value={money(i.soldValue)}
            />
            <Metric
              icon={ShoppingBag01Icon}
              label="Booking tokens"
              value={money(r.bookingValue)}
            />
            <Metric
              icon={Wallet01Icon}
              label="Monthly revenue to Tany"
              value={r.mrr ? rupees(r.mrr) : "—"}
              note={r.phase === "free" ? r.planLabel : `${r.planLabel} · ${PHASE_LABEL[r.phase]}`}
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Last {days} days</CardDescription>
          <CardTitle className="text-base">
            {restaurant ? "Sales" : "Leads"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quiet ? (
            <p className="text-sm text-muted-foreground">
              No activity in this period.
            </p>
          ) : (
            <TrendChart
              data={i.series}
              series={
                restaurant
                  ? [{ key: "gmv", name: "Sales (₹)", money: true }]
                  : [{ key: "leads", name: "Leads", type: "bar" }]
              }
            />
          )}
        </CardContent>
      </Card>

      {restaurant ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <MixCard title="Order status" hint="All time" rows={i.orderStatus} />
          <MixCard
            title="Order type"
            hint="Delivery, pickup, dine-in"
            rows={i.fulfilment}
          />
          <MixCard
            title="Payments"
            hint="Method and state"
            rows={i.payment}
            format={(k) => k.replace("cod", "Cash").replace("online", "Online")}
          />
          <ListCard
            title="Best sellers"
            hint="By sales, recent orders"
            empty="No orders yet."
            rows={i.topItems.map((t) => ({
              key: t.name,
              primary: t.name,
              secondary: `${t.qty} sold`,
              right: rupees(t.revenue),
            }))}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <FunnelCard
            title="Lead pipeline"
            hint="All time"
            steps={["new", "contacted", "visited", "won"].map((k) => ({
              label: label(k),
              count: i.leadStage.find((s) => s.key === k)?.count ?? 0,
            }))}
          />
          <MixCard
            title="Lead source"
            hint="Where buyers came from"
            rows={i.leadSource}
          />
          <MixCard title="Lead stage" hint="All stages" rows={i.leadStage} />
        </div>
      )}
    </div>
  )
}

async function MenuTab({ id }: { id: string }) {
  const [rows, cats] = await Promise.all([loadMenu(id), loadCategories(id)])
  return (
    <div className="flex flex-col gap-4">
      {cats.length ? (
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <Badge key={c.name} variant="secondary">
              {c.name} · {c.items}
            </Badge>
          ))}
        </div>
      ) : null}
      {rows.length ? (
        <MenuGrid rows={rows} scoped dealerId={id} />
      ) : (
        <EmptyState
          title="No dishes yet"
          body="This restaurant has not added a dish."
        />
      )}
    </div>
  )
}

async function CustomersTab({ id }: { id: string }) {
  const rows = await loadCustomers(id)
  return rows.length ? (
    <CustomersGrid rows={rows} scoped dealerId={id} />
  ) : (
    <EmptyState
      title="No guests yet"
      body="Guests appear after their first order."
    />
  )
}

async function DeliveryTab({ id }: { id: string }) {
  const [partners, zones] = await Promise.all([loadPartners(id), loadZones(id)])
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Riders</h2>
        {partners.length ? (
          <PartnersGrid rows={partners} scoped />
        ) : (
          <EmptyState
            title="No riders"
            body="This restaurant has not added a delivery rider."
          />
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Delivery zones</h2>
        {zones.length ? (
          <ZonesGrid rows={zones} scoped />
        ) : (
          <EmptyState
            title="No zones"
            body="This restaurant has not set delivery areas."
          />
        )}
      </section>
    </div>
  )
}

async function FeedbackTab({ id }: { id: string }) {
  const [reviews, enquiries] = await Promise.all([
    loadReviews(id),
    loadEnquiries(id),
  ])
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Reviews</h2>
        {reviews.length ? (
          <ReviewsGrid rows={reviews} scoped />
        ) : (
          <EmptyState
            title="No reviews"
            body="Guests have not left a review yet."
          />
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Enquiries</h2>
        {enquiries.length ? (
          <EnquiriesGrid rows={enquiries} scoped />
        ) : (
          <EmptyState
            title="No enquiries"
            body="No guest has sent a message yet."
          />
        )}
      </section>
    </div>
  )
}

async function MarketingTab({ id }: { id: string }) {
  const [coupons, banners] = await Promise.all([
    loadCoupons(id),
    loadBanners(id),
  ])
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Coupons</h2>
        {coupons.length ? (
          <CouponsGrid rows={coupons} scoped />
        ) : (
          <EmptyState
            title="No coupons"
            body="This restaurant has not created a discount code."
          />
        )}
      </section>
      <ListCard
        title="Banners"
        hint="Shown at the top of their page"
        empty="No banners."
        rows={banners.map((x) => ({
          key: x.id,
          primary: x.title,
          secondary: x.subtitle,
          right: x.active ? "Active" : "Hidden",
        }))}
      />
    </div>
  )
}
