import { type FareSettings, type FareSurcharge, type QuoteFailure, type QuoteInput, type QuoteResult, type TripType, quote } from "./fare"
import { rupeesToPaise } from "./money"
import { type StoredRateCard, pickRateCard } from "./rate-cards"
import { findState } from "./states"

/**
 * The fare preview on the rate-card page. It turns what the operator typed into a QuoteInput and runs the real fare engine
 * (the same quote() a booking uses), so what they see here is what a customer would be charged.
 */

export type CalcForm = {
  vehicleClassId: string
  tripType: TripType
  /** Distance one way, in km, as typed. For a round trip the engine is given there and back. */
  distanceKm: string
  /** "2026-11-02T10:00", India time, as a datetime-local field gives it. */
  startAt: string
  returnAt: string
  /** For local hourly trips: which package (a rate card id). */
  rateCardId: string
  packageId: string
  /** Comma-separated place names, matched against surcharges that name places (Kodaikanal). */
  places: string
  /** Two-letter codes of states entered (AP). */
  statesEntered: string[]
  expectedKm: string
  expectedHours: string
  tollRupees: string
  /** Where the service is supplied; defaults to the operator's own state. A GST state code or two-letter code. */
  supplyState: string
}

export type CalcData = {
  cards: StoredRateCard[]
  surcharges: FareSurcharge[]
  packages: { id: string; name: string; vehicleClassPrices: Record<string, number> }[]
  settings: FareSettings
}

export const blankForm = (vehicleClassId = ""): CalcForm => ({ vehicleClassId, tripType: "airport", distanceKm: "", startAt: "", returnAt: "", rateCardId: "", packageId: "", places: "", statesEntered: [], expectedKm: "", expectedHours: "", tollRupees: "", supplyState: "" })

/** The distance the engine bills: for a round trip, there and back; for a local package or a tour, none. */
export function plannedDistanceM(tripType: TripType, oneWayM: number): number {
  if (tripType === "outstation_round") return oneWayM * 2
  if (tripType === "local_hourly" || tripType === "package_tour") return 0
  return oneWayM
}

/** "2026-11-02T10:00" in India time to a Date, or null. */
export function parseIst(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return null
  const d = new Date(`${v.length === 16 ? `${v}:00` : v}+05:30`)
  return Number.isNaN(d.getTime()) ? null : d
}

const km = (v: string): number | null => {
  const t = v.trim()
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(t)) return null
  return Math.round(Number(t) * 1000)
}

export type Built = { ok: true; input: QuoteInput; card: StoredRateCard | null } | { ok: false; error: string }

/** Everything the preview needs, or the one thing to fix next. */
export function buildQuoteInput(f: CalcForm, data: CalcData): Built {
  if (!f.vehicleClassId) return { ok: false, error: "Choose a vehicle class." }
  const startAt = parseIst(f.startAt)
  if (!startAt) return { ok: false, error: "Enter the pickup date and time." }

  let oneWayM = 0
  if (f.tripType === "airport" || f.tripType === "outstation_one_way" || f.tripType === "outstation_round") {
    const m = km(f.distanceKm)
    if (m === null) return { ok: false, error: f.tripType === "outstation_round" ? "Enter the distance one way, in km." : "Enter the distance in km." }
    oneWayM = m
  }

  let returnAt: Date | null = null
  if (f.tripType === "outstation_round") {
    returnAt = parseIst(f.returnAt)
    if (!returnAt) return { ok: false, error: "Enter when the vehicle is released." }
  }

  const supply = findState(f.supplyState || data.settings.stateCode)
  const settings = data.settings
  const toll = f.tollRupees.trim() === "" ? null : rupeesToPaise(f.tollRupees)
  if (f.tollRupees.trim() !== "" && toll === null) return { ok: false, error: "Enter the tolls in rupees, like 450." }

  let card: StoredRateCard | null = null
  let packagePricePaise: number | null = null
  if (f.tripType === "package_tour") {
    const pkg = data.packages.find((p) => p.id === f.packageId)
    if (!pkg) return { ok: false, error: "Choose a tour package." }
    packagePricePaise = pkg.vehicleClassPrices[f.vehicleClassId] ?? null
    if (packagePricePaise === null) return { ok: false, error: `${pkg.name} has no price for this vehicle class.` }
  } else if (f.tripType === "local_hourly") {
    card = data.cards.find((c) => c.id === f.rateCardId && c.vehicleClassId === f.vehicleClassId && c.tripType === "local_hourly") ?? null
    if (!card) return { ok: false, error: "Choose a local package." }
  } else {
    card = pickRateCard(data.cards, { vehicleClassId: f.vehicleClassId, tripType: f.tripType, startAt })
    if (!card) return { ok: false, error: "No active rate card for this class and trip type on that day. Add one above." }
  }

  const expectedM = f.expectedKm.trim() === "" ? null : km(f.expectedKm)
  const expectedHours = f.expectedHours.trim() === "" ? null : /^\d{1,2}(\.\d{1,2})?$/.test(f.expectedHours.trim()) ? Math.round(Number(f.expectedHours) * 60) : NaN
  if (expectedM === null && f.expectedKm.trim() !== "") return { ok: false, error: "Enter the expected distance in km." }
  if (Number.isNaN(expectedHours)) return { ok: false, error: "Enter the expected hours, like 9.5." }

  return {
    ok: true,
    card,
    input: {
      tripType: f.tripType,
      vehicleClassId: f.vehicleClassId,
      rateCard: card,
      surcharges: data.surcharges,
      settings,
      distanceM: plannedDistanceM(f.tripType, oneWayM),
      startAt,
      returnAt,
      places: f.places.split(",").map((p) => p.trim()).filter(Boolean),
      statesEntered: f.statesEntered,
      packagePricePaise,
      expectedM,
      expectedMinutes: expectedHours,
      tollEstimatePaise: toll,
      placeOfSupplyStateCode: supply?.gst ?? null,
    },
  }
}

export type Calculated = { ok: true; result: Extract<QuoteResult, { ok: true }>; card: StoredRateCard | null } | { ok: false; error: string; fix?: { label: string; href: string } }

const FIELD_NAME: Record<string, string> = {
  perKmPaise: "the rate per km",
  minKmPerDay: "the minimum km per day",
  basePaise: "the base fare or package price",
  packageHours: "the package hours",
  packageKm: "the package km",
  extraKmPaise: "the extra km rate",
  extraHourPaise: "the extra hour rate",
  packagePricePaise: "the package price",
  rateCard: "a rate card",
}

/** Says, in plain words, what a failed quote needs. */
export function explainFailure(r: QuoteFailure): { error: string; fix?: { label: string; href: string } } {
  switch (r.reason) {
    case "not_configured": {
      if (r.missing.includes("gstRateBps")) return { error: "Set your GST rate first. Enter 0 if you do not charge GST.", fix: { label: "Open fares, GST and rules", href: "/cabs/settings" } }
      if (r.missing.includes("stateCode")) return { error: "Choose your state, which decides CGST + SGST or IGST.", fix: { label: "Open fares, GST and rules", href: "/cabs/settings" } }
      if (r.missing.includes("placeOfSupplyStateCode")) return { error: "Choose where the service is supplied (the pickup state)." }
      return { error: `The rate card is missing ${r.missing.map((m) => FIELD_NAME[m] ?? m).join(" and ")}.` }
    }
    case "invalid_input":
      return { error: r.detail }
    default:
      return { error: r.detail }
  }
}

/** The preview: build the input, run the real engine, explain any failure. */
export function calculate(f: CalcForm, data: CalcData): Calculated {
  const built = buildQuoteInput(f, data)
  if (!built.ok) return built
  const r = quote(built.input)
  if (!r.ok) return { ok: false, ...explainFailure(r) }
  return { ok: true, result: r, card: built.card }
}
