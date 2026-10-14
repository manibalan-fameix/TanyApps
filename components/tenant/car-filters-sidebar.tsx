"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  FilterIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { copy } from "@/lib/copy"
import type { CarFilters } from "@/lib/cars/filters"
import {
  bodyTypeOptions,
  featureOptions,
  fuelOptions,
  transmissionOptions,
} from "@/lib/cars/marketplace"
import { formatInr } from "@/lib/share/caption"

const t = copy.tenant.filters

type FacetGroup = { value: string; count: number }[]
type Bounds = { min: number; max: number }

const fallbackModels = [
  "Maruti Suzuki Swift",
  "Hyundai Creta",
  "Honda City",
  "Tata Nexon",
  "Maruti Suzuki Baleno",
  "Kia Seltos",
]
const fallbackColours = ["White", "Silver", "Grey", "Black", "Red", "Blue"]
const fallbackSeats = ["4", "5", "6", "7", "8", "9"]
const fallbackOwners = ["1", "2", "3", "4"]
const fallbackRtos = [
  "TN Chennai",
  "TN Coimbatore",
  "TN Madurai",
  "KA Bengaluru",
  "MH Mumbai",
  "DL Delhi",
]
const discountOptions = [
  "5% off or more",
  "10% off or more",
  "15% off or more",
  "20% off or more",
  "EMI discount",
]

function completeOptions(
  options: FacetGroup,
  fallback: readonly string[]
): FacetGroup {
  const counts = new Map(options.map((option) => [option.value, option.count]))
  const extra = options.filter((option) => !fallback.includes(option.value))
  return [
    ...fallback.map((value) => ({ value, count: counts.get(value) ?? 0 })),
    ...extra,
  ]
}

export function CarFiltersSidebar({
  filters,
  facets,
  resultCount,
}: {
  filters: CarFilters
  facets: {
    models: FacetGroup
    fuels: FacetGroup
    transmissions: FacetGroup
    priceBounds: Bounds | null
    kmBounds: Bounds | null
    yearBounds: Bounds | null
    bodyTypes: FacetGroup
    colours: FacetGroup
    rtos: FacetGroup
    owners: FacetGroup
    seats: FacetGroup
    features: FacetGroup
    safetyFeatures: FacetGroup
    warrantyCount: number
    returnAssuranceCount: number
  }
  resultCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { setOpenMobile } = useSidebar()

  const pushParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      mutate(params)
      router.push(
        `${pathname}${params.toString() ? `?${params.toString()}` : ""}`,
        { scroll: false }
      )
    },
    [pathname, router, searchParams]
  )

  const toggle = (key: string, value: string) =>
    pushParams((params) => {
      const active = params.getAll(key)
      params.delete(key)
      const next = active.includes(value)
        ? active.filter((v) => v !== value)
        : [...active, value]
      for (const v of next) params.append(key, v)
    })

  const commitRange = (
    range: [number, number],
    bounds: Bounds,
    minKey: string,
    maxKey: string
  ) =>
    pushParams((params) => {
      if (range[0] <= bounds.min) params.delete(minKey)
      else params.set(minKey, String(range[0]))
      if (range[1] >= bounds.max) params.delete(maxKey)
      else params.set(maxKey, String(range[1]))
    })

  const toggleFlag = (key: "warranty" | "returnAssurance", checked: boolean) =>
    pushParams((params) => {
      if (checked) params.set(key, "1")
      else params.delete(key)
    })

  const hasActiveFilters =
    filters.models.length > 0 ||
    filters.fuels.length > 0 ||
    filters.transmissions.length > 0 ||
    filters.minPrice != null ||
    filters.maxPrice != null ||
    filters.minKm != null ||
    filters.maxKm != null ||
    filters.minYear != null ||
    filters.maxYear != null ||
    filters.bodyTypes.length > 0 ||
    filters.colours.length > 0 ||
    filters.rtos.length > 0 ||
    filters.owners.length > 0 ||
    filters.seats.length > 0 ||
    filters.features.length > 0 ||
    filters.safetyFeatures.length > 0 ||
    filters.warranty ||
    filters.returnAssurance ||
    filters.discounts.length > 0

  const clearAll = () =>
    pushParams((params) => {
      for (const key of [
        "model",
        "fuel",
        "transmission",
        "minPrice",
        "maxPrice",
        "minKm",
        "maxKm",
        "minYear",
        "maxYear",
        "bodyType",
        "colour",
        "rto",
        "owner",
        "seats",
        "feature",
        "safety",
        "warranty",
        "returnAssurance",
        "discount",
      ]) {
        params.delete(key)
      }
    })

  const modelOptions = completeOptions(facets.models, fallbackModels)
  const fuelFacetOptions = completeOptions(facets.fuels, fuelOptions)
  const transmissionFacetOptions = completeOptions(
    facets.transmissions,
    transmissionOptions
  )
  const bodyTypeFacetOptions = completeOptions(
    facets.bodyTypes,
    bodyTypeOptions
  )
  const colourFacetOptions = completeOptions(facets.colours, fallbackColours)
  const seatFacetOptions = completeOptions(facets.seats, fallbackSeats)
  const ownerFacetOptions = completeOptions(facets.owners, fallbackOwners)
  const rtoFacetOptions = completeOptions(facets.rtos, fallbackRtos)
  const featureFacetOptions = completeOptions(
    facets.features,
    Object.values(featureOptions).flat()
  )
  const safetyFacetOptions = completeOptions(
    facets.safetyFeatures,
    featureOptions.safety
  )
  const priceBounds = facets.priceBounds ?? { min: 0, max: 20_000_000 }
  const yearBounds = facets.yearBounds ?? {
    min: 2000,
    max: new Date().getFullYear(),
  }
  const kmBounds = facets.kmBounds ?? { min: 0, max: 1_000_000 }

  return (
    <Sidebar
      collapsible="offcanvas"
      className="top-14 h-[calc(100svh-3.5rem)] lg:top-16 lg:h-[calc(100svh-4rem)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-sidebar-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-sidebar-foreground">
          <HugeiconsIcon
            icon={FilterIcon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          Filters
        </span>
        {hasActiveFilters && (
          <Button variant="ghost" size="xs" onClick={clearAll}>
            Clear all
          </Button>
        )}
      </div>
      <SidebarContent className="gap-0">
        {priceBounds.min < priceBounds.max && (
          <BudgetFilter
            key={`${filters.minPrice ?? "min"}-${filters.maxPrice ?? "max"}`}
            bounds={priceBounds}
            value={[
              filters.minPrice ?? priceBounds.min,
              filters.maxPrice ?? priceBounds.max,
            ]}
            onCommit={(range) =>
              commitRange(range, priceBounds, "minPrice", "maxPrice")
            }
          />
        )}
        {modelOptions.length > 0 && (
          <ModelFilter
            options={modelOptions}
            active={filters.models}
            onToggle={(v) => toggle("model", v)}
          />
        )}
        {yearBounds.min < yearBounds.max && (
          <RangeFilter
            label="Model year"
            bounds={yearBounds}
            value={[
              filters.minYear ?? yearBounds.min,
              filters.maxYear ?? yearBounds.max,
            ]}
            onCommit={(range) =>
              commitRange(range, yearBounds, "minYear", "maxYear")
            }
            format={(value) => String(value)}
          />
        )}
        {kmBounds.min < kmBounds.max && (
          <RangeFilter
            label="Kms driven"
            bounds={kmBounds}
            value={[
              filters.minKm ?? kmBounds.min,
              filters.maxKm ?? kmBounds.max,
            ]}
            onCommit={(range) => commitRange(range, kmBounds, "minKm", "maxKm")}
            format={(value) => `${formatInr(value)} km`}
          />
        )}
        {bodyTypeFacetOptions.length > 0 && (
          <OptionFilter
            label="Body type"
            options={bodyTypeFacetOptions}
            active={filters.bodyTypes}
            onToggle={(v) => toggle("bodyType", v)}
            appearance="cards"
          />
        )}
        <BooleanFilter
          label="Return assurance"
          description="Buyback or return coverage"
          count={facets.returnAssuranceCount}
          checked={filters.returnAssurance}
          onCheckedChange={(checked) => toggleFlag("returnAssurance", checked)}
        />
        {fuelFacetOptions.length > 0 && (
          <OptionFilter
            label={t.fuel}
            options={fuelFacetOptions}
            active={filters.fuels}
            onToggle={(v) => toggle("fuel", v)}
            appearance="cards"
          />
        )}
        {transmissionFacetOptions.length > 0 && (
          <OptionFilter
            label={t.transmission}
            options={transmissionFacetOptions}
            active={filters.transmissions}
            onToggle={(v) => toggle("transmission", v)}
          />
        )}
        {colourFacetOptions.length > 0 && (
          <OptionFilter
            label="Colour"
            options={colourFacetOptions}
            active={filters.colours}
            onToggle={(v) => toggle("colour", v)}
            appearance="cards"
          />
        )}
        {seatFacetOptions.length > 0 && (
          <OptionFilter
            label="Seats"
            options={seatFacetOptions}
            active={filters.seats}
            onToggle={(v) => toggle("seats", v)}
            formatLabel={(value) =>
              /seater/i.test(value) ? value : `${value} Seater`
            }
          />
        )}
        {ownerFacetOptions.length > 0 && (
          <OptionFilter
            label="Owners"
            options={ownerFacetOptions}
            active={filters.owners.map(String)}
            onToggle={(v) => toggle("owner", v)}
            formatLabel={(value) => {
              const owner = Number(value)
              return `${owner === 1 ? "First" : owner === 2 ? "Second" : owner === 3 ? "Third" : `${owner}th`} owner`
            }}
          />
        )}
        {rtoFacetOptions.length > 0 && (
          <OptionFilter
            label="RTO"
            options={rtoFacetOptions}
            active={filters.rtos}
            onToggle={(v) => toggle("rto", v)}
          />
        )}
        {featureFacetOptions.length > 0 && (
          <OptionFilter
            label="Features"
            options={featureFacetOptions}
            active={filters.features}
            onToggle={(v) => toggle("feature", v)}
            appearance="cards"
          />
        )}
        {safetyFacetOptions.length > 0 && (
          <OptionFilter
            label="Safety"
            options={safetyFacetOptions}
            active={filters.safetyFeatures}
            onToggle={(v) => toggle("safety", v)}
            appearance="cards"
          />
        )}
        <BooleanFilter
          label="Warranty"
          description="Warranty-backed vehicles"
          count={facets.warrantyCount}
          checked={filters.warranty}
          onCheckedChange={(checked) => toggleFlag("warranty", checked)}
        />
        <OptionFilter
          label="Discount"
          options={discountOptions.map((value) => ({ value, count: 0 }))}
          active={filters.discounts}
          onToggle={(value) => toggle("discount", value)}
        />
      </SidebarContent>
      <SidebarFooter className="gap-3 border-t border-sidebar-border p-3">
        <Button className="md:hidden" onClick={() => setOpenMobile(false)}>
          {t.showResults(resultCount)}
        </Button>
        <p className="text-center text-xs text-sidebar-foreground/60">
          {copy.tenant.poweredBy}{" "}
          <Logo className="inline-block h-3.5 align-middle" />
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function FilterSection({
  title,
  children,
  separator = true,
}: {
  title: React.ReactNode
  children: React.ReactNode
  separator?: boolean
}) {
  return (
    <>
      {separator && <SidebarSeparator className="mx-0" />}
      <SidebarGroup className="px-4 py-5">
        <Collapsible defaultOpen className="group/collapsible">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              {title}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={2}
              className="size-4 shrink-0 text-sidebar-foreground/60 transition-transform group-data-open/collapsible:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarGroupContent className="mt-4">
              {children}
            </SidebarGroupContent>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>
    </>
  )
}

function BudgetFilter({
  bounds,
  value,
  onCommit,
}: {
  bounds: { min: number; max: number }
  value: [number, number]
  onCommit: (range: [number, number]) => void
}) {
  return (
    <FilterSection title="Budget" separator={false}>
      <PriceSlider bounds={bounds} value={value} onCommit={onCommit} />
    </FilterSection>
  )
}

function ModelFilter({
  options,
  active,
  onToggle,
}: {
  options: FacetGroup
  active: string[]
  onToggle: (value: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const matching = options.filter((option) =>
    option.value.toLowerCase().includes(query.trim().toLowerCase())
  )
  const quickOptions = matching.slice(0, 6)
  const remainingOptions = matching.slice(6)

  return (
    <FilterSection title="Make & model">
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          strokeWidth={2}
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sidebar-foreground/60"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a brand or model"
          className="h-11 rounded-xl border-sidebar-border bg-sidebar pl-9 text-sidebar-foreground shadow-none"
        />
      </div>
      <p className="mt-5 text-sm text-sidebar-foreground/60">
        {query ? "Matching models" : "Popular models"}
      </p>
      {matching.length === 0 ? (
        <p className="mt-3 text-sm text-sidebar-foreground/60">
          No models found
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={active.includes(option.value)}
                onClick={() => onToggle(option.value)}
                className={cn(
                  "max-w-full rounded-xl border-sidebar-border bg-sidebar px-3 text-sidebar-foreground",
                  active.includes(option.value) &&
                    "border-sidebar-primary bg-sidebar-accent text-sidebar-accent-foreground"
                )}
              >
                <span className="truncate">{option.value}</span>
                <span className="text-sidebar-foreground/50">
                  {option.count}
                </span>
              </Button>
            ))}
          </div>
          {remainingOptions.length > 0 && (
            <ul className="mt-4 flex max-h-52 flex-col gap-1 overflow-y-auto border-t border-sidebar-border pt-3">
              {remainingOptions.map((option) => (
                <OptionRow
                  key={option.value}
                  option={option}
                  checked={active.includes(option.value)}
                  onToggle={onToggle}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </FilterSection>
  )
}

function RangeFilter({
  label,
  bounds,
  value,
  onCommit,
  format,
}: {
  label: string
  bounds: Bounds
  value: [number, number]
  onCommit: (range: [number, number]) => void
  format: (value: number) => string
}) {
  return (
    <FilterSection title={label}>
      <RangeSlider
        bounds={bounds}
        value={value}
        onCommit={onCommit}
        format={format}
      />
    </FilterSection>
  )
}

function BooleanFilter({
  label,
  description,
  count,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  count: number
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <FilterSection title={label}>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-sidebar-accent/50 px-3 py-3 hover:bg-sidebar-accent">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sidebar-foreground">
            {label}
          </span>
          <span className="mt-0.5 block text-xs text-sidebar-foreground/60">
            {description}
          </span>
        </span>
        <span className="text-sm text-sidebar-foreground/60">{count}</span>
      </label>
    </FilterSection>
  )
}

function OptionFilter({
  label,
  options,
  active,
  onToggle,
  appearance = "plain",
  formatLabel,
}: {
  label: string
  options: FacetGroup
  active: string[]
  onToggle: (value: string) => void
  appearance?: "plain" | "cards"
  formatLabel?: (value: string) => string
}) {
  return (
    <FilterSection title={label}>
      <ul
        className={cn("flex flex-col gap-1", appearance === "cards" && "gap-2")}
      >
        {options.map((option) => (
          <OptionRow
            key={option.value}
            option={option}
            checked={active.includes(option.value)}
            onToggle={onToggle}
            appearance={appearance}
            formatLabel={formatLabel}
          />
        ))}
      </ul>
    </FilterSection>
  )
}

function OptionRow({
  option,
  checked,
  onToggle,
  appearance = "plain",
  formatLabel,
}: {
  option: FacetGroup[number]
  checked: boolean
  onToggle: (value: string) => void
  appearance?: "plain" | "cards"
  formatLabel?: (value: string) => string
}) {
  return (
    <li>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-sidebar-accent",
          appearance === "cards" &&
            "bg-sidebar-accent/50 px-3 py-3 hover:bg-sidebar-accent"
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggle(option.value)}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-sidebar-foreground">
          {formatLabel?.(option.value) ?? option.value}
        </span>
        <span className="text-sm text-sidebar-foreground/60">
          {option.count}
        </span>
      </label>
    </li>
  )
}

function PriceSlider({
  bounds,
  value,
  onCommit,
}: {
  bounds: Bounds
  value: [number, number]
  onCommit: (range: [number, number]) => void
}) {
  const [local, setLocal] = React.useState<[number, number]>(value)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-lg font-semibold tracking-tight text-sidebar-primary">
        <span>₹{formatInr(local[0])}</span>
        <span>₹{formatInr(local[1])}</span>
      </div>
      <Slider
        min={bounds.min}
        max={bounds.max}
        step={Math.max(1, Math.round((bounds.max - bounds.min) / 100))}
        value={local}
        onValueChange={(v) => setLocal(v as [number, number])}
        onValueCommitted={(v) => onCommit(v as [number, number])}
      />
      <div className="flex items-center justify-between text-sm text-sidebar-foreground/60">
        <span>Minimum</span>
        <span>Maximum</span>
      </div>
    </div>
  )
}

function RangeSlider({
  bounds,
  value,
  onCommit,
  format,
}: {
  bounds: Bounds
  value: [number, number]
  onCommit: (range: [number, number]) => void
  format: (value: number) => string
}) {
  const [local, setLocal] = React.useState<[number, number]>(value)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 text-lg font-semibold tracking-tight text-sidebar-primary">
        <span>{format(local[0])}</span>
        <span>{format(local[1])}</span>
      </div>
      <Slider
        min={bounds.min}
        max={bounds.max}
        step={Math.max(1, Math.round((bounds.max - bounds.min) / 100))}
        value={local}
        onValueChange={(next) => setLocal(next as [number, number])}
        onValueCommitted={(next) => onCommit(next as [number, number])}
      />
      <div className="flex items-center justify-between text-sm text-sidebar-foreground/60">
        <span>Minimum</span>
        <span>Maximum</span>
      </div>
    </div>
  )
}
