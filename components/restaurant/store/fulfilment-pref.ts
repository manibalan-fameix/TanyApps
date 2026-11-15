import type { Fulfilment } from "@/lib/restaurant/settings"

const KEY = "tany-fulfilment"

/** The Delivery / Pickup choice a guest made on the home screen, kept in this browser so checkout starts on it. */
export function readFulfilmentPref(): Fulfilment | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === "delivery" || v === "pickup" || v === "dine_in" ? v : null
  } catch {
    return null
  }
}

export function writeFulfilmentPref(value: Fulfilment) {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}
