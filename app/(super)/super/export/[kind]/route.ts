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
import { recordSecurityEvent } from "@/lib/core/security-audit"
import { superAdminActor } from "@/lib/super/guard"

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
  const actor = await superAdminActor()
  const { kind } = await params
  const load = LOADERS[kind]
  if (!load) return new NextResponse("Not found", { status: 404 })
  const business = request.nextUrl.searchParams.get("business") ?? undefined
  const rows = await load(
    business && UUID.test(business) ? business : undefined
  )
  // Fail closed: a whole-platform export is released only if the fact that it happened has been durably recorded first. Only the kind,
  // the row count and the business filter are recorded, never the content.
  try {
    await recordSecurityEvent({
      actorType: "super_admin",
      actorId: actor.uid,
      actorLabel: actor.email,
      businessId: business && UUID.test(business) ? business : null,
      action: "super.export",
      targetType: "export",
      targetId: kind,
      outcome: "success",
      metadata: { kind, rows: rows.length, scoped: Boolean(business && UUID.test(business)) },
    })
  } catch {
    return NextResponse.json({ error: "audit_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } })
  }
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tany-${kind}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  })
}
