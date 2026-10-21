import { type CalcData, type CalcForm, buildQuoteInput, explainFailure } from "./calculator"
import { type QuoteInput, type QuoteSuccess, type TripType, quote } from "./fare"
import { pickRateCard } from "./rate-cards"
import { findState } from "./states"
import type { PlacesProvider, PlaceRef, RouteResult } from "../core/geo/places"
import { routeBetween } from "../core/geo/route-cache"
import type { TripQuoteSnapshot } from "../db/schema"

/**
 * Prices a trip request with the fare engine. The customer's booking page, the vehicle list and the operator's manual booking all
 * come through here, so a given trip costs the same wherever it is asked for. Pure apart from the distance lookup, which is injected.
 */

export type PlaceInput = { placeId: string | null; name: string; address: string; lat: number | null; lng: number | null; stateCode: string | null }

export type TripRequest = {
  tripType: TripType
  pickup: PlaceInput
  drop: PlaceInput | null
  startAt: Date
  returnAt: Date | null
  pax: number
  bags: number
  /** Local hourly: the package the customer chose, e.g. 8 hours and 80 km. */
  localPackage?: { hours: number; km: number } | null
  packageId?: string | null
  /** Operator only: a distance typed in when no map service is available. One way, in km. */
  manualDistanceKm?: number | null
}

export type ClassFit = { id: string; name: string; seats: number; bags: number; active: boolean }

/** Every reason a request can be turned down before or during pricing. The screens translate these codes. */
export type QuoteErrorCode =
  | "too_soon"
  | "too_far_ahead"
  | "return_before_start"
  | "need_drop"
  | "need_return"
  | "need_package"
  | "no_map_service"
  | "no_route"
  | "no_fit"
  | "not_configured"
  | "no_price"

export type Distance = { distanceM: number; durationS: number | null; source: RouteResult["source"] }

export type TripQuote =
  | { ok: true; classId: string; result: QuoteSuccess; input: QuoteInput; distance: Distance | null }
  | { ok: false; code: QuoteErrorCode; detail?: string }

/** Soonest a pickup can be, whatever the operator set: nobody can arrange a car in less. */
export const ABSOLUTE_MIN_LEAD_MINUTES = 15
export const MAX_DAYS_AHEAD = 365

export function checkTiming(req: Pick<TripRequest, "startAt" | "returnAt" | "tripType">, minLeadMinutes: number, now: Date): QuoteErrorCode | null {
  const lead = Math.max(minLeadMinutes, ABSOLUTE_MIN_LEAD_MINUTES)
  if (req.startAt.getTime() < now.getTime() + lead * 60_000) return "too_soon"
  if (req.startAt.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) return "too_far_ahead"
  if (req.tripType === "outstation_round") {
    if (!req.returnAt) return "need_return"
    if (req.returnAt.getTime() <= req.startAt.getTime()) return "return_before_start"
  }
  return null
}

const needsRoute = (t: TripType) => t === "airport" || t === "outstation_one_way" || t === "outstation_round"
const istLocal = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16)
const ref = (p: PlaceInput): PlaceRef | null => (p.placeId ? { placeId: p.placeId, lat: p.lat ?? undefined, lng: p.lng ?? undefined } : null)

/** The one distance lookup for a request, shared by every vehicle class. Null distance means the trip type needs none. */
export async function resolveDistance(req: TripRequest, provider: PlacesProvider | null): Promise<{ ok: true; route: Distance | null } | { ok: false; code: QuoteErrorCode }> {
  if (!needsRoute(req.tripType)) return { ok: true, route: null }
  if (!req.drop) return { ok: false, code: "need_drop" }
  if (req.manualDistanceKm != null) return { ok: true, route: { distanceM: Math.round(req.manualDistanceKm * 1000), durationS: null, source: "manual" } }
  const from = ref(req.pickup)
  const to = ref(req.drop)
  if (!provider || !from || !to) return { ok: false, code: "no_map_service" }
  const found = await routeBetween(provider, from, to)
  if (!found) return { ok: false, code: "no_route" }
  return { ok: true, route: { distanceM: found.route.distanceM, durationS: found.route.durationS, source: found.route.source } }
}

/** Prices one vehicle class. `route` comes from resolveDistance, once per request. */
export function quoteForClass(cls: ClassFit, req: TripRequest, data: CalcData, route: Distance | null): TripQuote {
  if (!cls.active || cls.seats < req.pax || cls.bags < req.bags) return { ok: false, code: "no_fit" }
  if (req.tripType === "package_tour" && !req.packageId) return { ok: false, code: "need_package" }

  let rateCardId = ""
  if (req.tripType === "local_hourly") {
    if (!req.localPackage) return { ok: false, code: "need_package" }
    const card = pickRateCard(data.cards, { vehicleClassId: cls.id, tripType: "local_hourly", startAt: req.startAt, packageHours: req.localPackage.hours, packageKm: req.localPackage.km })
    if (!card) return { ok: false, code: "no_price" }
    rateCardId = card.id
  }

  const operatorState = findState(data.settings.stateCode)
  const enteredStates = new Set<string>()
  for (const p of [req.pickup, req.drop]) {
    const s = findState(p?.stateCode)
    if (s && s.gst !== operatorState?.gst) enteredStates.add(s.code)
  }
  const form: CalcForm = {
    vehicleClassId: cls.id,
    tripType: req.tripType,
    distanceKm: route ? (route.distanceM / 1000).toFixed(3) : "",
    startAt: istLocal(req.startAt),
    returnAt: req.returnAt ? istLocal(req.returnAt) : "",
    rateCardId,
    packageId: req.packageId ?? "",
    // Commas separate names in the engine's input, so a name must not contain one.
    places: [req.pickup.name, req.drop?.name ?? ""].map((n) => n.replace(/,/g, " ")).filter(Boolean).join(","),
    statesEntered: [...enteredStates],
    expectedKm: "",
    expectedHours: "",
    tollRupees: "",
    supplyState: req.pickup.stateCode ?? "",
  }
  const built = buildQuoteInput(form, data)
  if (!built.ok) return { ok: false, code: "no_price", detail: built.error }
  const result = quote(built.input)
  if (!result.ok) {
    const why = explainFailure(result)
    return { ok: false, code: result.reason === "not_configured" ? "not_configured" : "no_price", detail: why.error }
  }
  return { ok: true, classId: cls.id, result, input: built.input, distance: route }
}

/** What is stored with a trip. Place names are left out of the input: a pickup name can be a home address. */
export function snapshotOf(q: Extract<TripQuote, { ok: true }>, now: Date): TripQuoteSnapshot {
  const { places: _places, ...input } = q.input
  void _places
  return {
    version: 1,
    at: now.toISOString(),
    input: JSON.parse(JSON.stringify(input)) as Record<string, unknown>,
    result: JSON.parse(JSON.stringify(q.result)) as Record<string, unknown>,
    distanceM: q.distance?.distanceM ?? 0,
    durationS: q.distance?.durationS ?? null,
    distanceSource: q.distance?.source ?? null,
  }
}
