import { NextResponse, type NextRequest } from "next/server"

import { toCsv } from "@/lib/super/csv"
import {
  loadBookings,
  loadBusinesses,
  loadCars,
  loadLeads,
  loadOrders,
  loadUsers,
} from "@/lib/super/data"
import {
  loadCoupons,
  loadCustomers,
  loadEnquiries,
  loadMenu,
  loadPartners,
  loadReviews,
} from "@/lib/super/queries"
import { requireSuperAdmin } from "@/lib/super/guard"

export const dynamic = "force-dynamic"

const LOADERS: Record<
  string,
  (dealerId?: string) => Promise<Record<string, unknown>[]>
> = {
  businesses: () => loadBusinesses(),
  users: () => loadUsers(),
  cars: loadCars,
  leads: loadLeads,
  orders: loadOrders,
  bookings: loadBookings,
  menu: loadMenu,
  customers: loadCustomers,
  reviews: loadReviews,
  enquiries: loadEnquiries,
  coupons: loadCoupons,
  partners: loadPartners,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Downloads a list as CSV. Same access check as every super admin page; buyer phones stay masked. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  await requireSuperAdmin()
  const { kind } = await params
  const load = LOADERS[kind]
  if (!load) return new NextResponse("Not found", { status: 404 })
  const business = request.nextUrl.searchParams.get("business") ?? undefined
  const rows = await load(
    business && UUID.test(business) ? business : undefined
  )
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tany-${kind}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  })
}
