"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  matchVariantsAction,
  retryRcAction,
  saveDetailsAction,
  selectVariantAction,
} from "@/app/(admin)/(shell)/cars/actions"
import type { RcSummary, VariantSuggestion } from "@/lib/cars/dto"
import type { CarState } from "@/lib/cars/state"
import { FooterAction } from "@/components/cars/wizard-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { copy } from "@/lib/copy"
import type { RcErrorCode } from "@/lib/rc/types"
import { cn } from "@/lib/utils"

const t = copy.admin.addCar.details

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value ?? "—"}</dd>
    </div>
  )
}

export function DetailsStep({
  car,
  rc: initialRc,
  rcError: initialRcError,
  hint,
  onCarChange,
  onNext,
}: {
  car: CarState
  rc: RcSummary | null
  rcError: RcErrorCode | null
  /** What the video said the car is, to start the variant search from. */
  hint?: string
  onCarChange: (car: CarState) => void
  onNext: () => void
}) {
  const [rc, setRc] = useState(initialRc)
  const [rcError, setRcError] = useState(initialRcError)
  const [retrying, setRetrying] = useState(false)

  const [text, setText] = useState(
    () =>
      hint ||
      [initialRc?.year ?? car.year, initialRc?.modelRaw]
        .filter(Boolean)
        .join(" ")
  )
  const [suggestions, setSuggestions] = useState<VariantSuggestion[] | null>(
    null
  )
  const [finding, setFinding] = useState(false)
  const [choosing, setChoosing] = useState<string | null>(null)

  const [year, setYear] = useState(car.year ? String(car.year) : "")
  const [owners, setOwners] = useState(
    car.ownerCount ? String(car.ownerCount) : ""
  )
  const [colour, setColour] = useState(car.colour ?? "")
  const [error, setError] = useState<string | null>(null)

  const needsFacts = !car.year || !car.ownerCount

  /** Save any hand-typed facts before matching: the year improves the match. */
  const saveFacts = useCallback(async () => {
    const y = Number(year)
    const o = Number(owners)
    if (!needsFacts && !colour) return car
    const res = await saveDetailsAction({
      carId: car.id,
      year: y >= 1990 ? y : undefined,
      ownerCount: o >= 1 ? o : undefined,
      colour: colour.trim() || undefined,
    })
    if (res.ok && res.car) {
      onCarChange(res.car)
      return res.car
    }
    return car
  }, [car, colour, needsFacts, onCarChange, owners, year])

  const find = useCallback(
    async (query: string) => {
      setError(null)
      setFinding(true)
      try {
        const res = await matchVariantsAction({ carId: car.id, text: query })
        setSuggestions(res.ok ? res.suggestions : [])
      } catch {
        setSuggestions([])
      } finally {
        setFinding(false)
      }
    },
    [car.id]
  )

  // With RC data we can search straight away, so the dealer usually just taps a result.
  const auto = useRef(false)
  useEffect(() => {
    if (auto.current || car.variant || !text.trim()) return
    auto.current = true
    void find(text)
  }, [car.variant, text, find])

  async function choose(id: string) {
    setChoosing(id)
    setError(null)
    try {
      const res = await selectVariantAction({ carId: car.id, variantId: id })
      if (res.ok && res.car) onCarChange(res.car)
      else setError(copy.admin.addCar.plate.failed)
    } finally {
      setChoosing(null)
    }
  }

  async function retryRc() {
    setRetrying(true)
    try {
      const res = await retryRcAction(car.id)
      if (res.ok) {
        setRc(res.rc)
        setRcError(res.rcError)
      }
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {car.reg || t.fromVideo}
            {car.rcVerified ? (
              <Badge>{copy.admin.cars.manage.verified}</Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            {!car.reg
              ? t.fromVideoBody
              : rc
                ? car.rcVerified
                  ? t.rcTitle
                  : t.rcUnverified
                : rcError === "not_found"
                  ? t.rcNotFound
                  : t.rcMissing}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rc ? (
            <dl className="divide-y divide-border">
              <Row
                label="RC"
                value={[rc.makerRaw, rc.modelRaw].filter(Boolean).join(" · ")}
              />
              <Row label={t.fuel} value={rc.fuel} />
              <Row label={t.year} value={rc.year} />
              <Row label={t.owners} value={rc.ownerCount} />
              <Row label={t.insurance} value={rc.insuranceValidTill} />
              <Row
                label={t.loan}
                value={
                  rc.hypothecated === null
                    ? null
                    : rc.hypothecated
                      ? t.loanActive
                      : t.loanCleared
                }
              />
            </dl>
          ) : car.reg ? (
            <Button variant="outline" onClick={retryRc} disabled={retrying}>
              {t.retryRc}
            </Button>
          ) : null}

          {(!rc || needsFacts) && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="year">{t.year}</Label>
                <Input
                  id="year"
                  inputMode="numeric"
                  value={year}
                  onChange={(e) =>
                    setYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="2017"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="owners">{t.owners}</Label>
                <Input
                  id="owners"
                  inputMode="numeric"
                  value={owners}
                  onChange={(e) =>
                    setOwners(e.target.value.replace(/\D/g, "").slice(0, 2))
                  }
                  placeholder="1"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="colour">{t.colour}</Label>
                <Input
                  id="colour"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.findTitle}</CardTitle>
          <CardDescription>{t.findHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              await saveFacts()
              await find(text)
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t.findPlaceholder}
              aria-label={t.findTitle}
              className="h-10"
            />
            <Button type="submit" disabled={finding || !text.trim()}>
              {finding ? t.finding : t.find}
            </Button>
          </form>

          {suggestions && suggestions.length === 0 && !finding && (
            <p className="text-sm text-muted-foreground">{t.noMatch}</p>
          )}

          {suggestions && suggestions.length > 0 && (
            <div
              className="flex flex-col gap-2"
              role="group"
              aria-label={t.pick}
            >
              <p className="text-sm text-muted-foreground">{t.pick}</p>
              {suggestions.map((s, i) => {
                const selected = car.variant?.id === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={choosing !== null}
                    onClick={() => choose(s.id)}
                    data-testid="variant-option"
                    className={cn(
                      "flex flex-col items-start gap-0.5 rounded-2xl border p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2 font-medium">
                      {s.label}
                      {selected ? (
                        <Badge>{t.selected}</Badge>
                      ) : i === 0 && s.source === "ai" ? (
                        <Badge variant="secondary">{t.matchAi}</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {[
                        s.fuel,
                        s.transmission,
                        s.engineCc ? `${s.engineCc} cc` : null,
                        s.years,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {car.variant && suggestions === null && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t.selected}: </span>
              <span className="font-medium">{car.variant.label}</span>
            </p>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <FooterAction>
        <Button
          size="lg"
          onClick={async () => {
            await saveFacts()
            onNext()
          }}
          disabled={!car.variant}
        >
          {copy.admin.addCar.next}
        </Button>
      </FooterAction>
    </div>
  )
}
