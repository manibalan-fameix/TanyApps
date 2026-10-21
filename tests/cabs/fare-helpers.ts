import type { FareCoupon, FareRateCard, FareSettings, FareSurcharge, QuoteInput } from "../../lib/cabs/fare"

export const SETTINGS: FareSettings = { nightStart: "22:00", nightEnd: "06:00", gstRateBps: 500, stateCode: "33", advanceBps: null }

export const rateCard = (tripType: FareRateCard["tripType"], over: Partial<FareRateCard> = {}): FareRateCard => ({
  tripType,
  basePaise: null,
  perKmPaise: null,
  minKmPerDay: null,
  perHourPaise: null,
  packageHours: null,
  packageKm: null,
  extraKmPaise: null,
  extraHourPaise: null,
  bataPerDayPaise: null,
  ...over,
})

export const surcharge = (over: Partial<FareSurcharge> & Pick<FareSurcharge, "kind">): FareSurcharge => ({
  id: "s1",
  label: "Surcharge",
  scope: {},
  amountPaise: 1000,
  bps: null,
  ...over,
})

export const coupon = (over: Partial<FareCoupon> = {}): FareCoupon => ({ code: "C1", kind: "flat", value: 1000, ...over })

/** IST wall-clock time as a Date. */
export const ist = (s: string) => new Date(`${s}+05:30`)

export function input(over: Partial<QuoteInput> = {}): QuoteInput {
  return {
    tripType: "airport",
    vehicleClassId: "sedan",
    rateCard: rateCard("airport", { basePaise: 20000, perKmPaise: 1400 }),
    surcharges: [],
    settings: SETTINGS,
    distanceM: 10_000,
    startAt: ist("2026-11-02T10:00:00"),
    placeOfSupplyStateCode: "33",
    ...over,
  }
}
