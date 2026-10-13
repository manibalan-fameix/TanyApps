"use client"

import { useState } from "react"

import { publishCarAction } from "@/app/(admin)/(shell)/cars/actions"
import { useUploads } from "@/components/capture/upload-provider"
import { useCarSync } from "@/components/cars/use-car-sync"
import { FooterAction } from "@/components/cars/wizard-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HERO_ANGLE } from "@/lib/angles"
import type { ShareKit } from "@/lib/cars/publish"
import { publishReadiness } from "@/lib/cars/readiness"
import type { CarState } from "@/lib/cars/state"
import { copy } from "@/lib/copy"
import { formatInr } from "@/lib/share/caption"

const t = copy.admin.addCar.price
const digits = (s: string) => s.replace(/\D/g, "")

export function PriceStep({
  car,
  onCarChange,
  onPublished,
}: {
  car: CarState
  onCarChange: (c: CarState) => void
  onPublished: (kit: ShareKit, car: CarState) => void
}) {
  const uploads = useUploads()
  const refresh = useCarSync(car, onCarChange)
  const [price, setPrice] = useState(
    car.askingPrice ? String(car.askingPrice) : ""
  )
  const [km, setKm] = useState(car.kmDriven != null ? String(car.kmDriven) : "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A confirmed upload counts even if this screen has not refreshed yet: confirm only succeeds
  // once the server has seen the bytes.
  const heroItems = uploads
    .items(car.id)
    .filter((i) => i.kind === "photo" && i.angle === HERO_ANGLE)
  const heroConfirmed = heroItems.some((i) => i.state === "done")
  const heroUploading = heroItems.some(
    (i) => i.state !== "done" && i.state !== "failed"
  )
  const readiness = publishReadiness(
    heroConfirmed && !car.media.some((m) => m.angle === HERO_ANGLE)
      ? {
          ...car,
          media: [
            ...car.media,
            {
              id: "pending",
              kind: "photo",
              angle: HERO_ANGLE,
              status: "uploaded",
              url: "",
              analysis: null,
            },
          ],
        }
      : car
  )
  const priceN = Number(price)
  const kmN = Number(km)
  const priceOk = price !== "" && priceN >= 10_000 && priceN <= 50_000_000
  const kmOk = km !== "" && kmN >= 0 && kmN <= 999_999

  const blocker = readiness.missing.includes("variant")
    ? t.needVariant
    : readiness.missing.includes("year")
      ? t.needYear
      : readiness.missing.includes("hero")
        ? heroUploading
          ? t.heroUploading
          : t.needHero
        : null

  async function publish() {
    setError(null)
    if (!priceOk) return setError(t.badPrice)
    if (!kmOk) return setError(t.badKm)
    setBusy(true)
    try {
      const res = await publishCarAction({
        carId: car.id,
        price: priceN,
        km: kmN,
      })
      if (!res.ok) {
        if (res.error === "not_ready") void refresh() // the screen was behind the server: catch up
        setError(
          res.error === "cap_reached"
            ? t.capReached
            : res.error === "closed"
              ? t.closed
              : res.error === "suspended"
                ? t.suspended
                : res.error === "invalid"
                  ? priceOk
                    ? t.badKm
                    : t.badPrice
                  : t.failed
        )
        return
      }
      onPublished(res.kit, {
        ...car,
        status: "live",
        askingPrice: priceN,
        kmDriven: kmN,
      })
    } catch {
      setError(t.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">{t.priceLabel}</Label>
          <Input
            id="price"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(digits(e.target.value).slice(0, 8))}
            className="h-11 text-lg"
            autoComplete="off"
          />
          {priceOk && (
            <p className="text-sm text-muted-foreground">
              ₹{formatInr(priceN)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="km">{t.kmLabel}</Label>
          <Input
            id="km"
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(digits(e.target.value).slice(0, 6))}
            className="h-11 text-lg"
            autoComplete="off"
          />
          {kmOk && (
            <p className="text-sm text-muted-foreground">{formatInr(kmN)} km</p>
          )}
        </div>

        {blocker && (
          <Alert>
            <AlertDescription>{blocker}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FooterAction>
          <Button
            size="lg"
            onClick={publish}
            disabled={busy || readiness.missing.length > 0}
          >
            {busy ? t.publishing : t.publish}
          </Button>
        </FooterAction>
      </CardContent>
    </Card>
  )
}
