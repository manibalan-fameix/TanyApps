import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { BlockedPeriods } from "@/components/cabs/fleet"
import { DriverActions, DriverDocuments, DriverEditCard, DutyLog } from "@/components/cabs/drivers"
import { PageHeader } from "@/components/restaurant/page-header"
import { loadDriverDetail } from "@/lib/cabs/page-data"
import { requireIndustry } from "@/lib/core/guards"
import { scopedDb } from "@/lib/db/scoped"
import { privateStorageAvailable } from "@/lib/storage"

export const metadata = { title: "Driver" }
export const dynamic = "force-dynamic"

export default async function DriverPage({ params }: { params: Promise<{ id: string }> }) {
  const { dealer } = await requireIndustry("cabs")
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) notFound()
  const detail = await loadDriverDetail(scopedDb(dealer.id), id, new Date())
  if (!detail) notFound()
  const { driver, docs, duty, blocked } = detail
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link href="/cabs/drivers" className="text-sm text-muted-foreground underline">All drivers</Link>
        <PageHeader title={driver.name} description={`+91 ${driver.phone}`} />
      </div>
      <DriverActions id={driver.id} status={driver.status} name={driver.name} />
      <DriverEditCard driver={driver} />
      <DriverDocuments driverId={driver.id} docs={docs} storageReady={privateStorageAvailable()} />
      <BlockedPeriods resourceType="driver" resourceId={driver.id} rows={blocked} />
      <DutyLog rows={duty} />
    </div>
  )
}
