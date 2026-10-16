import Link from "next/link"

import { PageHeader } from "@/components/restaurant/page-header"
import { SuperSearchBox } from "@/components/super/search-box"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { searchPlatform } from "@/lib/super/queries"

export const metadata = { title: "Search" }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const q = ((await searchParams).q ?? "").trim()
  const r = await searchPlatform(q)
  const groups = [
    {
      title: "Businesses",
      rows: r.businesses.map((x) => ({
        ...x,
        href: `/super/businesses/${x.id}`,
      })),
    },
    {
      title: "Users",
      rows: r.users.map((x) => ({
        ...x,
        href: x.businessId
          ? `/super/businesses/${x.businessId}`
          : "/super/users",
      })),
    },
    {
      title: "Orders",
      rows: r.orders.map((x) => ({
        ...x,
        href: `/super/businesses/${x.businessId}?tab=orders`,
      })),
    },
    {
      title: "Cars",
      rows: r.cars.map((x) => ({
        ...x,
        href: `/super/businesses/${x.businessId}?tab=catalog`,
      })),
    },
  ]
  const total = groups.reduce((s, g) => s + g.rows.length, 0)
  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="Search"
        description="Find any business, person, order or car by name, email, phone, order code or registration."
      />
      <SuperSearchBox defaultValue={q} autoFocus />
      {q.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          Type at least two characters.
        </p>
      ) : total === 0 ? (
        <p className="text-sm text-muted-foreground">No results for “{q}”.</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <Card key={g.title}>
              <CardHeader>
                <CardDescription>{g.rows.length} found</CardDescription>
                <CardTitle className="text-base">{g.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y text-sm">
                {g.rows.map((x) => (
                  <Link
                    key={x.id}
                    href={x.href}
                    className="py-2 hover:underline"
                  >
                    <p className="truncate font-medium">{x.name}</p>
                    <p className="truncate text-muted-foreground">{x.sub}</p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  )
}
