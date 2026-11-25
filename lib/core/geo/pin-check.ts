import { distanceKm, type Point } from "./distance"

/** How far a pin may be from the middle of the typed pincode and still count as being in it. */
export const PINCODE_SLACK_KM = 5

export type PinAgreement = "match" | "mismatch" | "unknown"

/**
 * Does a map pin agree with the pincode the guest typed? OpenStreetMap's pincodes in India are often missing or are the
 * neighbouring one, so a different (or no) pincode at the pin is not enough to reject it: a pin close to the middle of
 * the typed pincode still counts. "unknown" means the map service could not tell either way.
 */
export function pinAgreement(foundPincode: string | null, centre: Point | null, pin: Point, typed: string): PinAgreement {
  if (foundPincode === typed) return "match"
  if (centre) return distanceKm(centre, pin) <= PINCODE_SLACK_KM ? "match" : "mismatch"
  return foundPincode ? "mismatch" : "unknown"
}
