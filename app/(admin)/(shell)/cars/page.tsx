import { desc, inArray, sql } from "drizzle-orm"
import Link from "next/link"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"
import { CarsGrid, type CarRow } from "@/components/cars/cars-grid"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getDealerContext } from "@/lib/auth/context"
import {
  emptyMarketplaceDetails,
  marketplaceDetailsSchema,
} from "@/lib/cars/marketplace"
import { computeTanyScore } from "@/lib/cars/score"
import { readVoiceDraft, voiceDraftTitle } from "@/lib/cars/from-voice"
import { copy } from "@/lib/copy"
import { carMedia, cars } from "@/lib/db/schema"
import { scopedDb } from "@/lib/db/scoped"
import { HERO_ANGLE } from "@/lib/angles"
import { formatReg } from "@/lib/reg"
import { tryDecrypt } from "@/lib/crypto"
import { getStorage } from "@/lib/storage"
import { getVariantsByIds } from "@/lib/variants/repo"
import { cn } from "@/lib/utils"

export const metadata = { title: copy.admin.cars.title }
const t = copy.admin.cars

export default async function CarsPage() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok" || !ctx.dealerInDb) {
    return (
      <Alert className="max-w-lg">
        <AlertDescription>{copy.admin.dashboard.noDealerBody}</AlertDescription>
      </Alert>
    )
  }
  const db = scopedDb(ctx.dealer.id)
  const rows = await db.cars.select(undefined, {
    orderBy: [sql`${cars.listedAt} desc nulls last`, desc(cars.id)],
    limit: 100,
  })

  const variantIds = [
    ...new Set(rows.map((r) => r.variantId).filter((v): v is string => !!v)),
  ]
  const variantRows = await getVariantsByIds(variantIds)
  const label = new Map(
    variantRows.map((v) => [v.id, `${v.make} ${v.model} ${v.variant}`])
  )

  const heroes = rows.length
    ? await db.carMedia.select(
        inArray(
          carMedia.carId,
          rows.map((r) => r.id)
        )
      )
    : []
  const storage = getStorage()
  const hero = new Map(
    heroes
      .filter(
        (m) =>
          m.angle === HERO_ANGLE &&
          (m.status === "uploaded" || m.status === "ready")
      )
      .map((m) => [m.carId, storage.publicUrl(m.r2Key)])
  )

  const photoCount = new Map<string, number>()
  for (const m of heroes) {
    if (m.kind === "photo" && (m.status === "uploaded" || m.status === "ready"))
      photoCount.set(m.carId, (photoCount.get(m.carId) ?? 0) + 1)
  }
  // Drafts are unfinished, so a score would only mislead; they show a dash until published.
  const scoreOf = (car: (typeof rows)[number]) => {
    if (car.status === "draft") return null
    return computeTanyScore({
      year: car.year,
      kmDriven: car.kmDriven,
      ownerCount: car.ownerCount,
      askingPrice: car.askingPrice,
      insuranceValidTill: car.insuranceValidTill,
      hypothecationCleared: car.hypothecationCleared,
      rcVerified: car.rcVerifiedAt != null,
      photoCount: Math.min(photoCount.get(car.id) ?? 0, 8),
      details: marketplaceDetailsSchema
        .catch(emptyMarketplaceDetails())
        .parse(car.marketplaceDetails ?? {}),
    })
  }

  const data: CarRow[] = rows.map((car) => {
    const result = scoreOf(car)
    return {
      id: car.id,
      href:
        car.status === "draft" ? `/cars/new?car=${car.id}` : `/cars/${car.id}`,
      draft: car.status === "draft",
      image: hero.get(car.id) ?? null,
      title:
        [car.year, car.variantId ? label.get(car.variantId) : null]
          .filter(Boolean)
          .join(" ") ||
        voiceDraftTitle(readVoiceDraft(car.voiceDraft)) ||
        t.untitled,
      reg: formatReg(tryDecrypt(car.regNumber) ?? ""),
      year: car.year,
      fuel: car.fuel,
      transmission: car.transmission,
      km: car.kmDriven,
      owners: car.ownerCount,
      price: car.askingPrice,
      status: car.status,
      listedAt: car.listedAt ? car.listedAt.toISOString() : null,
      colour: car.colour,
      insuranceValidTill: car.insuranceValidTill,
      soldPrice: car.soldPrice,
      score: result?.score ?? null,
      scoreBand: result?.band ?? null,
    }
  })

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <Link href="/cars/new" className={cn(buttonVariants())}>
          {t.add}
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.empty.title}</CardTitle>
            <CardDescription>{t.empty.body}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <CarsGrid rows={data} />
      )}
    </div>
  )
}
