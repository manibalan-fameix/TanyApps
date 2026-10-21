import { istDateString } from "./time"
import type { FareRateCard, TripType } from "./fare"

export type StoredRateCard = FareRateCard & {
  id: string
  vehicleClassId: string
  validFrom: string | null
  validTo: string | null
  active: boolean
}

/** Whether a card is in force on a day ("YYYY-MM-DD", IST). An open end means no limit on that side. */
export function inForce(card: Pick<StoredRateCard, "active" | "validFrom" | "validTo">, day: string): boolean {
  return card.active && (!card.validFrom || card.validFrom <= day) && (!card.validTo || card.validTo >= day)
}

/** Two cards compete when they are for the same class and trip type (and, for hourly packages, the same package). */
export function sameSlot(a: StoredRateCard, b: StoredRateCard): boolean {
  return a.vehicleClassId === b.vehicleClassId && a.tripType === b.tripType && (a.packageHours ?? null) === (b.packageHours ?? null) && (a.packageKm ?? null) === (b.packageKm ?? null)
}

/** Whether the date ranges of two cards overlap (an open end overlaps everything on that side). */
export function datesOverlap(a: Pick<StoredRateCard, "validFrom" | "validTo">, b: Pick<StoredRateCard, "validFrom" | "validTo">): boolean {
  const aStartsBeforeBEnds = !a.validFrom || !b.validTo || a.validFrom <= b.validTo
  const bStartsBeforeAEnds = !b.validFrom || !a.validTo || b.validFrom <= a.validTo
  return aStartsBeforeBEnds && bStartsBeforeAEnds
}

/** An active card that already covers some of the same days for the same class, trip type and package. */
export function findConflict(candidate: StoredRateCard, others: readonly StoredRateCard[]): StoredRateCard | null {
  if (!candidate.active) return null
  return others.find((o) => o.id !== candidate.id && o.active && sameSlot(o, candidate) && datesOverlap(o, candidate)) ?? null
}

/**
 * The card to price a trip with: in force on the trip's pickup day, for the class and trip type (and the chosen package for hourly
 * trips). If dates overlap anyway, the one that started most recently wins, so a new season's card replaces an old one.
 */
export function pickRateCard(
  cards: readonly StoredRateCard[],
  want: { vehicleClassId: string; tripType: TripType; startAt: Date; packageHours?: number | null; packageKm?: number | null },
): StoredRateCard | null {
  const day = istDateString(want.startAt)
  const matches = cards.filter(
    (c) =>
      c.vehicleClassId === want.vehicleClassId &&
      c.tripType === want.tripType &&
      inForce(c, day) &&
      (want.tripType !== "local_hourly" || ((want.packageHours == null || c.packageHours === want.packageHours) && (want.packageKm == null || c.packageKm === want.packageKm))),
  )
  matches.sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""))
  return matches[0] ?? null
}
