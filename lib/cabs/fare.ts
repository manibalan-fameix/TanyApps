import type { SurchargeScope } from "../db/schema/cabs.ts"
import { calendarDays, inWindow, istDateString, istMinuteOfDay, parseClock } from "./time.ts"

/**
 * The TanyCabs fare engine. A pure function: the same input always gives the same quote, it reads no clock, database or
 * network, and it never looks at GPS. The server calls it to price a booking and again at trip end; the rate-card page
 * calls it for the live preview.
 *
 * Money is whole paise in the outputs. Inside, every amount is an exact BigInt in units of a ten-thousandth of a paise, so
 * percentages and per-kilometre rates never lose a fraction along the way. The only rounding is the last step: the total is
 * rounded to the nearest whole rupee, and a "Rounding" line shows the difference so the lines always add up to the total.
 *
 * Nothing here has a default price. A rate the operator has not entered makes the quote fail with `not_configured` and the
 * list of what is missing.
 */

export type TripType = "airport" | "outstation_one_way" | "outstation_round" | "local_hourly" | "package_tour"

export type FareRateCard = {
  tripType: TripType
  basePaise: number | null
  perKmPaise: number | null
  minKmPerDay: number | null
  perHourPaise: number | null
  packageHours: number | null
  packageKm: number | null
  extraKmPaise: number | null
  extraHourPaise: number | null
  bataPerDayPaise: number | null
}

export type FareSurcharge = {
  id: string
  kind: "night" | "hill" | "permit" | "airport" | "festival"
  label: string
  scope: SurchargeScope
  amountPaise: number | null
  bps: number | null
}

export type FareSettings = {
  /** "22:00". The operator's night window; a night surcharge may carry its own. */
  nightStart: string | null
  nightEnd: string | null
  /** GST on the fare, in basis points (500 is 5%). Null means the operator has not decided: the quote fails. 0 means none. */
  gstRateBps: number | null
  /** Two-digit GST state code of the operator. */
  stateCode: string | null
  /** Share of the total taken as an advance, in basis points. Null means not set. */
  advanceBps: number | null
}

export type FareCoupon = {
  code: string
  kind: "percent" | "flat"
  /** Basis points for a percentage (1000 is 10%), paise for a flat amount. */
  value: number
  maxDiscountPaise?: number | null
  /** The fare (before GST) must be at least this many paise. */
  minSubtotalPaise?: number | null
}

export type QuoteInput = {
  tripType: TripType
  vehicleClassId: string
  /** The rate card for this class and trip type. Not needed for a package tour, which is priced by `packagePricePaise`. */
  rateCard: FareRateCard | null
  surcharges: readonly FareSurcharge[]
  settings: FareSettings
  /** The whole distance to bill, in metres (for a round trip, there and back). */
  distanceM: number
  /** Pickup time. Night charges and festival dates use it. */
  startAt: Date
  /** Round trips: when the vehicle is released. */
  returnAt?: Date | null
  /** One-way outstation trips that run over several days. */
  endAt?: Date | null
  /** Names of the places on the trip (pickup, stops, drop), matched against a surcharge's `places`. */
  places?: readonly string[]
  /** Two-letter codes of states the trip enters beyond the operator's own, one permit charge each. */
  statesEntered?: readonly string[]
  /** Package tours: the fixed price for this vehicle class. */
  packagePricePaise?: number | null
  /** Local packages: what the trip is expected to run to, to show the likely overage. Not billed until trip end. */
  expectedM?: number | null
  expectedMinutes?: number | null
  /** Tolls on the route if known. Shown, never added to the total: actual tolls are billed at the end of the trip. */
  tollEstimatePaise?: number | null
  coupon?: FareCoupon | null
  /** Two-digit GST state code where the service is supplied. Decides CGST + SGST versus IGST. */
  placeOfSupplyStateCode: string | null
}

export type FareLine = {
  key: string
  label: string
  paise: number
  kind: "fare" | "allowance" | "surcharge" | "discount" | "tax" | "rounding" | "info"
  /** False for information that is not part of the total (the toll estimate). */
  included: boolean
  detail?: string
}

export type QuoteFailure =
  | { ok: false; reason: "invalid_input"; detail: string }
  | { ok: false; reason: "not_configured"; missing: string[] }
  | { ok: false; reason: "coupon_invalid" | "coupon_minimum_not_met"; detail: string }

export type QuoteSuccess = {
  ok: true
  lines: FareLine[]
  /** Everything before GST, after discount, in paise (to the paise, not rounded to a rupee). */
  taxablePaise: number
  gst: { rateBps: number; cgstPaise: number; sgstPaise: number; igstPaise: number }
  /** The amount the customer pays, a whole number of rupees in paise. */
  totalPaise: number
  /** The advance due at booking, rounded to a rupee, or null when the operator has not set one. */
  advanceDuePaise: number | null
  tollEstimatePaise: number | null
  meta: { days: number; distanceM: number; billedM: number; minKmApplied: boolean }
  /** Things the operator should fix (a night surcharge with no window). The quote is still valid. */
  warnings: string[]
  /**
   * Notices that must be shown with every quote, as keys the screens translate (copy.cabs.notices). Today: tolls and parking are
   * not in the total and are billed as actual. Shown on the operator's preview and the customer's booking alike.
   */
  notices: QuoteNotice[]
}

export type QuoteNotice = "tolls_parking_extra"

export type QuoteResult = QuoteSuccess | QuoteFailure

// ---------- exact arithmetic ----------

/** One paise is UNIT units. Percentages (basis points) and per-kilometre rates then stay whole numbers. */
const ZERO = BigInt(0)
const TWO = BigInt(2)
const TEN = BigInt(10)
const HUNDRED = BigInt(100)
const UNIT = BigInt(10_000)
const BPS = BigInt(10_000)
const RUPEE = HUNDRED * UNIT

const big = (n: number) => BigInt(n)
const isWhole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0

/** paise per kilometre × metres → units. 1 paise/km × 1 m = 0.001 paise = 10 units. */
const perKm = (paisePerKm: number, metres: number): bigint => big(paisePerKm) * big(metres) * TEN

const paiseToUnits = (p: number): bigint => big(p) * UNIT

/** BigInt division truncates toward zero; rounding needs it to floor, or a negative amount (a discount) rounds the wrong way. */
const floorDiv = (a: bigint, b: bigint): bigint => {
  const q = a / b
  return a % b !== ZERO && a < ZERO !== b < ZERO ? q - BigInt(1) : q
}

/** Round half up to a whole number of paise. */
const toPaise = (u: bigint): number => Number(floorDiv(u + UNIT / TWO, UNIT))

/** Round half up to a whole rupee, in paise. */
const toRupeePaise = (u: bigint): number => Number(floorDiv(u + RUPEE / TWO, RUPEE) * HUNDRED)

const bpsOf = (u: bigint, bps: number): bigint => (u * big(bps)) / BPS

// ---------- the quote ----------

export function quote(input: QuoteInput): QuoteResult {
  const bad = validate(input)
  if (bad) return bad

  const { tripType, rateCard, settings } = input
  const warnings: string[] = []
  const lines: { key: string; label: string; units: bigint; kind: FareLine["kind"]; detail?: string }[] = []
  const start = input.startAt

  // ----- days -----
  let days = 1
  if (tripType === "outstation_round") days = calendarDays(start, input.returnAt as Date)
  else if (tripType === "outstation_one_way" && input.endAt) days = calendarDays(start, input.endAt)

  // ----- the main fare -----
  let fareUnits = ZERO // what percentage surcharges apply to: the trip fare, not allowances or other surcharges
  let billedM = input.distanceM
  let minKmApplied = false

  const missing: string[] = []
  const need = (value: number | null | undefined, name: string): number => {
    if (!isWhole(value)) {
      missing.push(name)
      return 0
    }
    return value
  }

  if (tripType === "airport") {
    const rc = rateCard as FareRateCard
    const perKmPaise = need(rc.perKmPaise, "perKmPaise")
    const base = rc.basePaise ?? 0
    if (missing.length === 0) {
      if (base > 0) lines.push({ key: "base", label: "Base fare", units: paiseToUnits(base), kind: "fare" })
      const dist = perKm(perKmPaise, input.distanceM)
      lines.push({ key: "distance", label: "Distance", units: dist, kind: "fare", detail: `${km(input.distanceM)} km at ${rupees(perKmPaise)}/km` })
      fareUnits = paiseToUnits(base) + dist
    }
  } else if (tripType === "outstation_one_way" || tripType === "outstation_round") {
    const rc = rateCard as FareRateCard
    const perKmPaise = need(rc.perKmPaise, "perKmPaise")
    const minKmPerDay = need(rc.minKmPerDay, "minKmPerDay")
    if (missing.length === 0) {
      const minM = minKmPerDay * 1000 * days
      minKmApplied = minM > input.distanceM
      billedM = Math.max(input.distanceM, minM)
      fareUnits = perKm(perKmPaise, billedM)
      lines.push({
        key: "distance",
        label: "Distance",
        units: fareUnits,
        kind: "fare",
        detail: minKmApplied ? `Minimum ${minKmPerDay} km a day × ${days} ${days === 1 ? "day" : "days"} = ${km(billedM)} km at ${rupees(perKmPaise)}/km` : `${km(billedM)} km at ${rupees(perKmPaise)}/km`,
      })
      const bata = rc.bataPerDayPaise ?? 0
      if (bata > 0) lines.push({ key: "bata", label: "Driver allowance", units: paiseToUnits(bata) * big(days), kind: "allowance", detail: `${rupees(bata)} × ${days} ${days === 1 ? "day" : "days"}` })
    }
  } else if (tripType === "local_hourly") {
    const rc = rateCard as FareRateCard
    const price = need(rc.basePaise, "basePaise")
    const hours = need(rc.packageHours, "packageHours")
    const pkgKm = need(rc.packageKm, "packageKm")
    const wantsOverage = (isWhole(input.expectedM) && input.expectedM > pkgKm * 1000) || (isWhole(input.expectedMinutes) && input.expectedMinutes > hours * 60)
    if (wantsOverage && isWhole(input.expectedM) && input.expectedM > pkgKm * 1000) need(rc.extraKmPaise, "extraKmPaise")
    if (wantsOverage && isWhole(input.expectedMinutes) && input.expectedMinutes > hours * 60) need(rc.extraHourPaise, "extraHourPaise")
    if (missing.length === 0) {
      fareUnits = paiseToUnits(price)
      lines.push({ key: "package", label: `${hours} hr / ${pkgKm} km package`, units: fareUnits, kind: "fare" })
      if (isWhole(input.expectedM) && input.expectedM > pkgKm * 1000) {
        const overM = input.expectedM - pkgKm * 1000
        lines.push({ key: "extra_km", label: "Extra distance (estimate)", units: perKm(rc.extraKmPaise as number, overM), kind: "fare", detail: `${km(overM)} km at ${rupees(rc.extraKmPaise as number)}/km` })
      }
      if (isWhole(input.expectedMinutes) && input.expectedMinutes > hours * 60) {
        // A started hour is billed as a full hour.
        const overHours = Math.ceil((input.expectedMinutes - hours * 60) / 60)
        lines.push({ key: "extra_hours", label: "Extra time (estimate)", units: paiseToUnits(rc.extraHourPaise as number) * big(overHours), kind: "fare", detail: `${overHours} hr at ${rupees(rc.extraHourPaise as number)}/hr` })
      }
    }
  } else {
    const price = need(input.packagePricePaise, "packagePricePaise")
    if (missing.length === 0) {
      fareUnits = paiseToUnits(price)
      lines.push({ key: "package", label: "Tour package", units: fareUnits, kind: "fare" })
    }
  }

  if (missing.length > 0) return { ok: false, reason: "not_configured", missing }
  if (settings.gstRateBps === null) return { ok: false, reason: "not_configured", missing: ["gstRateBps"] }

  // ----- surcharges -----
  const applies = (s: FareSurcharge): boolean => {
    const sc = s.scope
    if (sc.vehicleClassIds?.length && !sc.vehicleClassIds.includes(input.vehicleClassId)) return false
    const types = sc.tripTypes?.length ? sc.tripTypes : s.kind === "airport" ? (["airport"] as TripType[]) : null
    if (types && !types.includes(tripType)) return false
    if (sc.places?.length) {
      const here = (input.places ?? []).map((p) => p.trim().toLowerCase())
      if (!sc.places.some((p) => here.includes(p.trim().toLowerCase()))) return false
    }
    if (sc.dateRanges?.length) {
      const day = istDateString(start)
      if (!sc.dateRanges.some((r) => day >= r.from && day <= r.to)) return false
    }
    return true
  }

  for (const s of input.surcharges) {
    if (s.kind === "night") {
      const from = parseClock(s.scope.window?.start ?? settings.nightStart)
      const to = parseClock(s.scope.window?.end ?? settings.nightEnd)
      if (from === null || to === null) {
        warnings.push(`"${s.label}" has no night window, so it was not applied.`)
        continue
      }
      if (!applies(s) || !inWindow(istMinuteOfDay(start), from, to)) continue
    } else if (s.kind === "permit") {
      if (!applies(s)) continue
      const wanted = s.scope.states?.length ? s.scope.states.map((x) => x.toUpperCase()) : null
      const entered = [...new Set((input.statesEntered ?? []).map((x) => x.toUpperCase()))]
      const hit = wanted ? entered.filter((st) => wanted.includes(st)) : entered
      for (const st of hit) {
        const u = surchargeUnits(s, fareUnits)
        lines.push({ key: `surcharge:${s.id}:${st}`, label: `${s.label} (${st})`, units: u, kind: "surcharge" })
      }
      continue
    } else if (!applies(s)) continue

    lines.push({ key: `surcharge:${s.id}`, label: s.label, units: surchargeUnits(s, fareUnits), kind: "surcharge", detail: s.bps !== null ? `${pct(s.bps)} of the fare` : undefined })
  }

  // ----- discount -----
  const subtotal = lines.reduce((a, l) => a + l.units, ZERO)
  let discount = ZERO
  if (input.coupon) {
    const c = input.coupon
    if (c.minSubtotalPaise && subtotal < paiseToUnits(c.minSubtotalPaise)) return { ok: false, reason: "coupon_minimum_not_met", detail: `The fare must be at least ${rupees(c.minSubtotalPaise)} to use ${c.code}.` }
    discount = c.kind === "percent" ? bpsOf(subtotal, c.value) : paiseToUnits(c.value)
    if (c.kind === "percent" && c.maxDiscountPaise != null) discount = discount < paiseToUnits(c.maxDiscountPaise) ? discount : paiseToUnits(c.maxDiscountPaise)
    if (discount > subtotal) discount = subtotal
    if (discount > ZERO) lines.push({ key: "discount", label: `Coupon ${c.code}`, units: -discount, kind: "discount" })
  }
  const taxable = subtotal - discount

  // ----- GST -----
  let cgst = ZERO
  let sgst = ZERO
  let igst = ZERO
  const rate = settings.gstRateBps
  if (rate > 0) {
    if (!settings.stateCode || !input.placeOfSupplyStateCode) return { ok: false, reason: "not_configured", missing: [!settings.stateCode ? "stateCode" : "placeOfSupplyStateCode"] }
    const tax = bpsOf(taxable, rate)
    if (settings.stateCode === input.placeOfSupplyStateCode) {
      cgst = tax / TWO
      sgst = tax - cgst
      lines.push({ key: "cgst", label: `CGST ${pct(rate / 2)}`, units: cgst, kind: "tax" })
      lines.push({ key: "sgst", label: `SGST ${pct(rate / 2)}`, units: sgst, kind: "tax" })
    } else {
      igst = tax
      lines.push({ key: "igst", label: `IGST ${pct(rate)}`, units: igst, kind: "tax" })
    }
  }

  // ----- total: rounded once, to the rupee -----
  const exactTotal = taxable + cgst + sgst + igst
  const totalPaise = toRupeePaise(exactTotal)
  const out: FareLine[] = lines.map((l) => ({ key: l.key, label: l.label, paise: toPaise(l.units), kind: l.kind, included: true, detail: l.detail }))
  const shown = out.reduce((a, l) => a + l.paise, 0)
  if (totalPaise !== shown) out.push({ key: "rounding", label: "Rounding", paise: totalPaise - shown, kind: "rounding", included: true })

  const toll = isWhole(input.tollEstimatePaise) ? input.tollEstimatePaise : null
  if (toll !== null) out.push({ key: "toll_estimate", label: "Tolls (estimate, billed at actuals)", paise: toll, kind: "info", included: false })

  let advanceDuePaise: number | null = null
  if (settings.advanceBps !== null) {
    advanceDuePaise = Math.min(totalPaise, toRupeePaise((big(totalPaise) * UNIT * big(settings.advanceBps)) / BPS))
  }

  return {
    ok: true,
    lines: out,
    taxablePaise: toPaise(taxable),
    gst: { rateBps: rate, cgstPaise: toPaise(cgst), sgstPaise: toPaise(sgst), igstPaise: toPaise(igst) },
    totalPaise,
    advanceDuePaise,
    tollEstimatePaise: toll,
    meta: { days, distanceM: input.distanceM, billedM, minKmApplied },
    warnings,
    notices: ["tolls_parking_extra"],
  }
}

function surchargeUnits(s: FareSurcharge, fareUnits: bigint): bigint {
  return s.amountPaise !== null ? paiseToUnits(s.amountPaise) : bpsOf(fareUnits, s.bps as number)
}

function validate(i: QuoteInput): QuoteFailure | null {
  const fail = (detail: string): QuoteFailure => ({ ok: false, reason: "invalid_input", detail })
  if (!isWhole(i.distanceM)) return fail("distanceM must be a whole number of metres, zero or more.")
  if (!(i.startAt instanceof Date) || Number.isNaN(i.startAt.getTime())) return fail("startAt must be a valid date.")
  if (i.tripType === "package_tour") {
    if (i.rateCard && i.rateCard.tripType !== "package_tour") return fail("The rate card is for a different trip type.")
  } else {
    if (!i.rateCard) return { ok: false, reason: "not_configured", missing: ["rateCard"] }
    if (i.rateCard.tripType !== i.tripType) return fail("The rate card is for a different trip type.")
  }
  if (i.tripType === "outstation_round") {
    if (!(i.returnAt instanceof Date) || Number.isNaN(i.returnAt.getTime())) return fail("A round trip needs returnAt.")
    if (i.returnAt.getTime() <= i.startAt.getTime()) return fail("returnAt must be after startAt.")
  }
  if (i.endAt && (!(i.endAt instanceof Date) || Number.isNaN(i.endAt.getTime()) || i.endAt.getTime() <= i.startAt.getTime())) return fail("endAt must be after startAt.")
  if (i.coupon && (!isWhole(i.coupon.value) || (i.coupon.kind === "percent" && i.coupon.value > 10_000))) return { ok: false, reason: "coupon_invalid", detail: "The coupon is not valid." }
  for (const s of i.surcharges) {
    if ((s.amountPaise === null) === (s.bps === null)) return fail(`Surcharge "${s.label}" needs exactly one of an amount or a percentage.`)
  }
  return null
}

// ---------- wording helpers (only for the lines' detail text) ----------

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
const km = (m: number) => (m / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })
const pct = (bps: number) => `${bps / 100}%`
