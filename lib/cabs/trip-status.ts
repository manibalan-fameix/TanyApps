import { defineStatusGraph } from "../core/status-graph"

/**
 * The life of a trip. `closed` means invoiced and settled. Every move is checked here; no action, route or button re-implements
 * "may this happen". Moves that need a driver or payments arrive with the phases that build them, but the graph is whole now so
 * the rules are settled once.
 */
export const TRIP_STATUSES = ["requested", "confirmed", "assigned", "driver_en_route", "arrived", "in_trip", "completed", "closed", "rejected", "cancelled", "expired", "no_show"] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

export const tripGraph = defineStatusGraph<TripStatus>({
  requested: ["confirmed", "rejected", "cancelled", "expired"],
  // Expired from here means the advance was not paid in time.
  confirmed: ["assigned", "cancelled", "expired"],
  assigned: ["driver_en_route", "cancelled"],
  driver_en_route: ["arrived", "cancelled"],
  arrived: ["in_trip", "no_show", "cancelled"],
  in_trip: ["completed"],
  completed: ["closed"],
  closed: [],
  rejected: [],
  cancelled: [],
  expired: [],
  no_show: [],
})

/** Waiting on someone: the operator's answer, or the customer's advance. These are the only states a hold deadline applies to. */
export const HOLD_STATUSES: readonly TripStatus[] = ["requested", "confirmed"]

/** Counts toward the month's bookings allowance: every booking made, whatever became of it, except ones the system expired unanswered. */
export const COUNTED_STATUSES: readonly TripStatus[] = TRIP_STATUSES.filter((s) => s !== "expired")

/** Still to happen or in progress: what the operator's "upcoming" and "today" views show. */
export const ACTIVE_STATUSES: readonly TripStatus[] = ["requested", "confirmed", "assigned", "driver_en_route", "arrived", "in_trip"]
