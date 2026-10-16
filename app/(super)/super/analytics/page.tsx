import { PageHeader } from "@/components/restaurant/page-header"
import { RangeSwitch, parseRange } from "@/components/restaurant/range-switch"
import {
  FunnelCard,
  ListCard,
  Metric,
  MixCard,
  healthLabel,
} from "@/components/super/metrics"
import { TrendChart } from "@/components/super/super-charts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChartLineData01Icon,
  Invoice01Icon,
  ShoppingBag01Icon,
  UserMultiple02Icon,
  Wallet01Icon,
  Building03Icon,
} from "@hugeicons/core-free-icons"
import { loadPlatformAnalytics } from "@/lib/super/queries"
import { label, money, num, rupees } from "@/lib/super/format"

export const metadata = { title: "Analytics" }

const METHOD = (k: string) =>
  k
    .replace("cod", "Cash")
    .replace("online", "Online")
    .replace("pending", "unpaid")

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const days = parseRange((await searchParams).days)
  const a = await loadPlatformAnalytics(days)
  const link = (id: string) => `/super/businesses/${id}`
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Analytics"
        description={`How the platform is growing and being used. Changes compare with the ${days} days before.`}
      >
        <RangeSwitch path="/super/analytics" days={days} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric
          icon={Building03Icon}
          label="New businesses"
          value={num(a.signups.value)}
          delta={a.signups.delta}
        />
        <Metric
          icon={UserMultiple02Icon}
          label="Leads"
          value={num(a.leads.value)}
          delta={a.leads.delta}
        />
        <Metric
          icon={ShoppingBag01Icon}
          label="Orders"
          value={num(a.orders.value)}
          delta={a.orders.delta}
        />
        <Metric
          icon={Wallet01Icon}
          label="Sales (GMV)"
          value={money(a.gmv.value)}
          delta={a.gmv.delta}
        />
        <Metric
          icon={ChartLineData01Icon}
          label="Average order"
          value={rupees(a.aov.value)}
          delta={a.aov.delta}
        />
        <Metric
          icon={Invoice01Icon}
          label="Booking tokens paid"
          value={money(a.bookingValue.value)}
          delta={a.bookingValue.delta}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Daily</CardDescription>
            <CardTitle className="text-base">Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.series}
              series={[{ key: "orders", name: "Orders", type: "bar" }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Daily</CardDescription>
            <CardTitle className="text-base">Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.series}
              series={[{ key: "leads", name: "Leads", type: "bar" }]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Daily</CardDescription>
            <CardTitle className="text-base">Booking tokens paid</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.series}
              series={[
                { key: "bookingValue", name: "Booking value (₹)", money: true },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Daily</CardDescription>
            <CardTitle className="text-base">New businesses</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={a.series}
              series={[{ key: "signups", name: "New businesses", type: "bar" }]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <FunnelCard
          title="Activation funnel"
          hint="Across every business, all time"
          steps={a.funnel}
        />
        <MixCard
          title="Business health"
          hint="Across every business"
          rows={a.health}
          format={healthLabel}
        />
        <MixCard
          title="Cars by status"
          hint="All dealers, all time"
          rows={a.carStatus}
        />
        <MixCard
          title="Order status"
          hint={`Orders in the last ${days} days`}
          rows={a.orderStatus}
        />
        <MixCard
          title="Order type"
          hint={`Delivery, pickup or dine-in, last ${days} days`}
          rows={a.fulfilment}
        />
        <MixCard
          title="Payments"
          hint={`Method and state, last ${days} days`}
          rows={a.payment}
          format={METHOD}
        />
        <MixCard
          title="Lead source"
          hint={`Where buyers came from, last ${days} days`}
          rows={a.leadSource}
        />
        <MixCard
          title="Lead stage"
          hint={`Pipeline, last ${days} days`}
          rows={a.leadStage}
        />
        <MixCard
          title="Booking status"
          hint={`Token payments, last ${days} days`}
          rows={a.bookingStatus}
        />
        <MixCard
          title="Guest ratings"
          hint="Stars across all reviews"
          rows={a.ratings}
          format={(k) => `${k} ★`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Where businesses are</CardDescription>
            <CardTitle className="text-base">Top cities</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Businesses</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.cities.map((c) => (
                  <TableRow key={c.city}>
                    <TableCell className="font-medium">{c.city}</TableCell>
                    <TableCell className="text-right">
                      {num(c.businesses)}
                    </TableCell>
                    <TableCell className="text-right">{num(c.leads)}</TableCell>
                    <TableCell className="text-right">{money(c.gmv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              Dealerships and restaurants side by side
            </CardDescription>
            <CardTitle className="text-base">By industry</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">Businesses</TableHead>
                  <TableHead className="text-right">Paying</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.industries.map((i) => (
                  <TableRow key={i.industry}>
                    <TableCell className="font-medium">
                      {label(i.industry)}
                    </TableCell>
                    <TableCell className="text-right">
                      {num(i.businesses)}
                    </TableCell>
                    <TableCell className="text-right">
                      {num(i.paying)}
                    </TableCell>
                    <TableCell className="text-right">
                      {i.mrr ? rupees(i.mrr) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{money(i.gmv)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardDescription>
              Businesses grouped by the month they joined
            </CardDescription>
            <CardTitle className="text-base">Sign-up cohorts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Signed up</TableHead>
                  <TableHead className="text-right">Still active</TableHead>
                  <TableHead className="text-right">Paying</TableHead>
                  <TableHead className="text-right">Paying share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.cohorts.map((c) => (
                  <TableRow key={c.month}>
                    <TableCell className="font-medium">{c.month}</TableCell>
                    <TableCell className="text-right">{c.signed}</TableCell>
                    <TableCell className="text-right">{c.active}</TableCell>
                    <TableCell className="text-right">{c.paying}</TableCell>
                    <TableCell className="text-right">
                      {c.signed ? Math.round((c.paying / c.signed) * 100) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <ListCard
          title="Top by sales"
          hint="Orders plus booking tokens"
          empty="No sales yet."
          rows={a.topGmv.map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: r.planLabel,
            right: money(r.orderValue + r.bookingValue),
          }))}
        />
        <ListCard
          title="Top by leads"
          hint="Buyer enquiries"
          empty="No leads yet."
          rows={a.topLeads.map((r) => ({
            key: r.id,
            href: link(r.id),
            primary: r.name,
            secondary: r.planLabel,
            right: `${num(r.leads)} leads`,
          }))}
        />
      </div>
    </div>
  )
}
