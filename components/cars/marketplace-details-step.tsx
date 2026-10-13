"use client"

import { useMemo, useState } from "react"

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { saveMarketplaceDetailsAction } from "@/app/(admin)/(shell)/cars/actions"
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
import { Textarea } from "@/components/ui/textarea"
import { featureIcon } from "@/lib/cars/feature-icons"
import {
  accidentHistoryOptions,
  availabilityOptions,
  batteryConditionOptions,
  bodyTypeOptions,
  emptyMarketplaceDetails,
  featureOptions,
  insuranceTypeOptions,
  locationOptions,
  protectionPlanOptions,
  reasonOptions,
  serviceHistoryOptions,
  tyreConditionOptions,
  type MarketplaceDetails,
} from "@/lib/cars/marketplace"
import type { CarState } from "@/lib/cars/state"
import { copy } from "@/lib/copy"
import { cn } from "@/lib/utils"

const t = copy.admin.addCar.marketplace
// Dealers type prices the way they write them: "1,25,000", "₹ 4.5 lakh" is not supported, but commas and spaces are.
const numberOrNull = (value: string) => {
  const cleaned = value.replace(/[,\s₹]/g, "")
  return cleaned === "" ? null : Number(cleaned)
}
/** Whole-number fields: a typed decimal such as "12345.6" is rounded rather than rejected. */
const wholeOrNull = (value: string) => {
  const n = numberOrNull(value)
  return n === null || !Number.isFinite(n) ? n : Math.round(n)
}
const textOrNull = (value: string) => value.trim() || null
type PricingInput = Omit<
  MarketplaceDetails["pricing"],
  | "emiStart"
  | "loanAmount"
  | "downPayment"
  | "loanDurationMonths"
  | "interestRate"
  | "bookingAmount"
  | "newCarPrice"
> & {
  emiStart: string
  loanAmount: string
  downPayment: string
  loanDurationMonths: string
  interestRate: string
  bookingAmount: string
  newCarPrice: string
}
type TrustInput = Omit<MarketplaceDetails["trust"], "inspectionScore"> & {
  inspectionScore: string
}

function Chip({
  selected,
  icon,
  children,
  onClick,
}: {
  selected: boolean
  icon?: IconSvgElement
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-muted"
      )}
    >
      {icon ? (
        <HugeiconsIcon
          icon={icon}
          strokeWidth={2}
          className="size-4 shrink-0"
        />
      ) : null}
      {children}
    </button>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function OptionField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Chip
            key={option}
            selected={value === option}
            onClick={() => onChange(value === option ? "" : option)}
          >
            {option}
          </Chip>
        ))}
      </div>
    </Field>
  )
}

function ToggleGroup({
  options,
  selected,
  onChange,
  icon,
}: {
  options: readonly string[]
  selected: string[]
  onChange: (selected: string[]) => void
  icon?: IconSvgElement
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Chip
          key={option}
          selected={selected.includes(option)}
          icon={icon}
          onClick={() =>
            onChange(
              selected.includes(option)
                ? selected.filter((v) => v !== option)
                : [...selected, option]
            )
          }
        >
          {option}
        </Chip>
      ))}
    </div>
  )
}

export function MarketplaceDetailsStep({
  car,
  onCarChange,
  onNext,
}: {
  car: CarState
  onCarChange: (car: CarState) => void
  onNext: () => void
}) {
  const initial = useMemo(
    () => ({ ...emptyMarketplaceDetails(), ...car.marketplaceDetails }),
    [car.marketplaceDetails]
  )
  const [overview, setOverview] = useState(initial.overview)
  const [pricing, setPricing] = useState<PricingInput>({
    ...initial.pricing,
    emiStart: initial.pricing.emiStart ? String(initial.pricing.emiStart) : "",
    loanAmount: initial.pricing.loanAmount
      ? String(initial.pricing.loanAmount)
      : "",
    downPayment: initial.pricing.downPayment
      ? String(initial.pricing.downPayment)
      : "",
    loanDurationMonths: initial.pricing.loanDurationMonths
      ? String(initial.pricing.loanDurationMonths)
      : "",
    interestRate: initial.pricing.interestRate
      ? String(initial.pricing.interestRate)
      : "",
    bookingAmount: initial.pricing.bookingAmount
      ? String(initial.pricing.bookingAmount)
      : "",
    newCarPrice: initial.pricing.newCarPrice
      ? String(initial.pricing.newCarPrice)
      : "",
  })
  const [trust, setTrust] = useState<TrustInput>({
    ...initial.trust,
    inspectionScore: initial.trust.inspectionScore
      ? String(initial.trust.inspectionScore)
      : "",
  })
  const [condition, setCondition] = useState(initial.condition)
  const [specs, setSpecs] = useState({
    engineCc: initial.specs.engineCc ?? "",
    bootSpace: initial.specs.bootSpace ?? "",
    seatingCapacity: initial.specs.seatingCapacity ?? "",
    mileage: initial.specs.mileage ?? "",
    groundClearance: initial.specs.groundClearance ?? "",
  })
  const [features, setFeatures] = useState(initial.features)
  const [protectionPlans, setProtectionPlans] = useState(
    initial.protectionPlans
  )
  const [panel, setPanel] = useState("")
  const [issue, setIssue] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | false>(false)

  function details(): MarketplaceDetails {
    return {
      overview: {
        ...overview,
        makeYear: textOrNull(String(overview.makeYear ?? "")),
        registrationYear: textOrNull(String(overview.registrationYear ?? "")),
      },
      pricing: {
        ...pricing,
        emiStart: wholeOrNull(pricing.emiStart),
        loanAmount: wholeOrNull(pricing.loanAmount),
        downPayment: wholeOrNull(pricing.downPayment),
        loanDurationMonths: wholeOrNull(pricing.loanDurationMonths),
        interestRate: numberOrNull(pricing.interestRate),
        bookingAmount: wholeOrNull(pricing.bookingAmount),
        newCarPrice: wholeOrNull(pricing.newCarPrice),
      },
      trust: {
        ...trust,
        inspectionScore: wholeOrNull(trust.inspectionScore),
      },
      condition,
      specs: Object.fromEntries(
        Object.entries(specs).filter(([, value]) => String(value).trim() !== "")
      ),
      features,
      protectionPlans,
    }
  }

  async function save(next = false) {
    setSaving(true)
    setSaved(false)
    setError(false)
    try {
      const res = await saveMarketplaceDetailsAction({
        carId: car.id,
        details: details(),
      })
      if (!res.ok || !res.car) {
        setError(("detail" in res && res.detail) || t.failed)
        return
      }
      onCarChange(res.car)
      setSaved(true)
      if (next) onNext()
    } catch {
      setError(t.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.overview}</CardTitle>
          <CardDescription>{t.optional}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Make year">
              <Input
                value={overview.makeYear ?? ""}
                onChange={(e) =>
                  setOverview({ ...overview, makeYear: e.target.value })
                }
                placeholder="Sep 2024"
              />
            </Field>
            <Field label="Registration year">
              <Input
                value={overview.registrationYear ?? ""}
                onChange={(e) =>
                  setOverview({ ...overview, registrationYear: e.target.value })
                }
                placeholder="Jan 2025"
              />
            </Field>
          </div>
          <OptionField
            label="Insurance type"
            value={overview.insuranceType ?? ""}
            options={insuranceTypeOptions}
            onChange={(insuranceType) =>
              setOverview({ ...overview, insuranceType })
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="RTO">
              <Input
                value={overview.rto ?? ""}
                onChange={(e) =>
                  setOverview({
                    ...overview,
                    rto: e.target.value.toUpperCase(),
                  })
                }
                placeholder="TN22"
              />
            </Field>
            <Field label="Car location">
              <Input
                value={overview.location ?? ""}
                onChange={(e) =>
                  setOverview({ ...overview, location: e.target.value })
                }
                placeholder="Vadapalani, Chennai"
              />
            </Field>
          </div>
          <OptionField
            label="Quick location options"
            value={overview.location ?? ""}
            options={locationOptions}
            onChange={(location) => setOverview({ ...overview, location })}
          />
          <OptionField
            label="Body type"
            value={overview.bodyType ?? ""}
            options={bodyTypeOptions}
            onChange={(bodyType) => setOverview({ ...overview, bodyType })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.pricing}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="EMI starting from (₹/month)">
            <Input
              inputMode="numeric"
              value={pricing.emiStart ?? ""}
              onChange={(e) =>
                setPricing({ ...pricing, emiStart: e.target.value })
              }
            />
          </Field>
          <Field label="Loan amount (₹)">
            <Input
              inputMode="numeric"
              value={pricing.loanAmount ?? ""}
              onChange={(e) =>
                setPricing({ ...pricing, loanAmount: e.target.value })
              }
            />
          </Field>
          <Field label="Down payment (₹)">
            <Input
              inputMode="numeric"
              value={pricing.downPayment ?? ""}
              onChange={(e) =>
                setPricing({ ...pricing, downPayment: e.target.value })
              }
            />
          </Field>
          <Field label="Loan duration (months)">
            <Input
              inputMode="numeric"
              value={pricing.loanDurationMonths ?? ""}
              onChange={(e) =>
                setPricing({ ...pricing, loanDurationMonths: e.target.value })
              }
            />
          </Field>
          <Field label="Interest rate (%)">
            <Input
              inputMode="decimal"
              value={pricing.interestRate ?? ""}
              onChange={(e) =>
                setPricing({ ...pricing, interestRate: e.target.value })
              }
            />
          </Field>
          <Field label="Booking amount (₹)">
            <Input
              inputMode="numeric"
              value={pricing.bookingAmount ?? ""}
              onChange={(e) =>
                setPricing({ ...pricing, bookingAmount: e.target.value })
              }
            />
          </Field>
          <Field label="New car ex-showroom price today (₹)">
            <Input
              inputMode="numeric"
              value={pricing.newCarPrice ?? ""}
              onChange={(e) =>
                setPricing({ ...pricing, newCarPrice: e.target.value })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <OptionField
              label="Availability"
              value={pricing.availabilityStatus ?? ""}
              options={availabilityOptions}
              onChange={(availabilityStatus) =>
                setPricing({ ...pricing, availabilityStatus })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Chip
              selected={pricing.tokenRefundable ?? true}
              onClick={() =>
                setPricing({
                  ...pricing,
                  tokenRefundable: !(pricing.tokenRefundable ?? true),
                })
              }
            >
              Refundable booking token
            </Chip>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.trust}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Inspection score">
              <Input
                inputMode="numeric"
                value={trust.inspectionScore ?? ""}
                onChange={(e) =>
                  setTrust({ ...trust, inspectionScore: e.target.value })
                }
                placeholder="200"
              />
            </Field>
            <OptionField
              label="Service history"
              value={trust.serviceHistory ?? ""}
              options={serviceHistoryOptions}
              onChange={(serviceHistory) =>
                setTrust({ ...trust, serviceHistory })
              }
            />
          </div>
          <Field label="Inspection summary">
            <Textarea
              value={trust.inspectionSummary ?? ""}
              onChange={(e) =>
                setTrust({ ...trust, inspectionSummary: e.target.value })
              }
              placeholder="We checked this car across major quality points."
            />
          </Field>
          <OptionField
            label="Accident history"
            value={trust.accidentHistory ?? ""}
            options={accidentHistoryOptions}
            onChange={(accidentHistory) =>
              setTrust({ ...trust, accidentHistory })
            }
          />
          <Field label="Reasons to buy">
            <ToggleGroup
              options={reasonOptions}
              selected={trust.reasonsToBuy}
              onChange={(reasonsToBuy) => setTrust({ ...trust, reasonsToBuy })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={trust.warrantyAvailable}
              onClick={() =>
                setTrust({
                  ...trust,
                  warrantyAvailable: !trust.warrantyAvailable,
                })
              }
            >
              Warranty available
            </Chip>
            <Chip
              selected={trust.floodAffected}
              onClick={() =>
                setTrust({ ...trust, floodAffected: !trust.floodAffected })
              }
            >
              Flood affected
            </Chip>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.condition}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionField
              label="Tyre condition"
              value={condition.tyreCondition ?? ""}
              options={tyreConditionOptions}
              onChange={(tyreCondition) =>
                setCondition({ ...condition, tyreCondition })
              }
            />
            <OptionField
              label="Battery condition"
              value={condition.batteryCondition ?? ""}
              options={batteryConditionOptions}
              onChange={(batteryCondition) =>
                setCondition({ ...condition, batteryCondition })
              }
            />
          </div>
          <Field label="Dent/scratch notes">
            <Textarea
              value={condition.dentNotes ?? ""}
              onChange={(e) =>
                setCondition({ ...condition, dentNotes: e.target.value })
              }
              placeholder="Minor scratch on front right door."
            />
          </Field>
          <Field label="Exterior notes">
            <Textarea
              value={condition.exteriorNotes ?? ""}
              onChange={(e) =>
                setCondition({ ...condition, exteriorNotes: e.target.value })
              }
            />
          </Field>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Input
              value={panel}
              onChange={(e) => setPanel(e.target.value)}
              placeholder="Panel, e.g. front door"
            />
            <Input
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="Issue"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!panel.trim() || !issue.trim()) return
                setCondition({
                  ...condition,
                  panelIssues: [
                    ...condition.panelIssues,
                    { panel: panel.trim(), issue: issue.trim() },
                  ],
                })
                setPanel("")
                setIssue("")
              }}
            >
              Add
            </Button>
          </div>
          {condition.panelIssues.length ? (
            <div className="flex flex-wrap gap-2">
              {condition.panelIssues.map((item, index) => (
                <button
                  key={`${item.panel}-${index}`}
                  type="button"
                  onClick={() =>
                    setCondition({
                      ...condition,
                      panelIssues: condition.panelIssues.filter(
                        (_, i) => i !== index
                      ),
                    })
                  }
                >
                  <Badge variant="secondary">
                    {item.panel}: {item.issue}
                  </Badge>
                </button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.specs}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {Object.entries({
            engineCc: "Engine CC",
            bootSpace: "Boot space",
            seatingCapacity: "Seating capacity",
            mileage: "Mileage",
            groundClearance: "Ground clearance",
          }).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                value={specs[key as keyof typeof specs]}
                onChange={(e) => setSpecs({ ...specs, [key]: e.target.value })}
              />
            </Field>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.features}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {Object.entries(featureOptions).map(([group, options]) => (
            <Field key={group} label={group[0].toUpperCase() + group.slice(1)}>
              <ToggleGroup
                options={options}
                selected={features[group as keyof typeof features]}
                onChange={(next) => setFeatures({ ...features, [group]: next })}
                icon={featureIcon}
              />
            </Field>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.protection}</CardTitle>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            options={protectionPlanOptions}
            selected={protectionPlans}
            onChange={setProtectionPlans}
          />
        </CardContent>
      </Card>

      {saved ? (
        <p className="text-sm text-muted-foreground">{t.saved}</p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FooterAction>
        <Button
          variant="outline"
          size="lg"
          onClick={() => void save(false)}
          disabled={saving}
        >
          {saving ? t.saving : t.save}
        </Button>
        <Button size="lg" onClick={() => void save(true)} disabled={saving}>
          {saving ? t.saving : copy.admin.addCar.next}
        </Button>
      </FooterAction>
    </div>
  )
}
