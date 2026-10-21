import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { BlockedPeriods, VehicleActions, VehicleDocuments, VehicleEditCard } from "@/components/cabs/fleet"
import { PageHeader } from "@/components/restaurant/page-header"
import { Badge } from "@/components/ui/badge"
import { classOptions, loadClasses, loadVehicleDetail } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"
import { privateStorageAvailable } from "@/lib/storage"

export const metadata = { title: "Vehicle" }
export const dynamic = "force-dynamic"

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { dealer } = await requireIndustry("cabs")
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const db = scopedDb(dealer.id)
  const [detail, classes] = await Promise.all([loadVehicleDetail(db, id, new Date()), loadClasses(db)])
  if (!detail) notFound()
  const { vehicle, docs, blocked } = detail
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/cabs/vehicles" className="text-sm text-muted-foreground underline">All vehicles</Link>
        <PageHeader title={vehicle.makeModel} description={`${vehicle.reg} · ${vehicle.className}`}>
          <Badge variant="secondary" className="capitalize">{vehicle.status}</Badge>
        </PageHeader>
      </div>
      <VehicleActions id={vehicle.id} status={vehicle.status} name={vehicle.makeModel} />
      <VehicleEditCard vehicle={vehicle} classes={classOptions(classes)} />
      <VehicleDocuments vehicleId={vehicle.id} docs={docs} storageReady={privateStorageAvailable()} />
      <BlockedPeriods resourceType="vehicle" resourceId={vehicle.id} rows={blocked} />
    </div>
  )
}
