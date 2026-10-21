import { TRIP_TYPE_LABEL } from "./schemas"
import type { TripStatus } from "./trip-status"

/** How the operator's screens name a booking's state. (The customer sees their own wording, in their language.) */
export const OPERATOR_STATUS: Record<TripStatus, string> = {
  requested: "Needs your answer",
  confirmed: "Confirmed",
  assigned: "Driver assigned",
  driver_en_route: "Driver on the way",
  arrived: "Driver arrived",
  in_trip: "On the trip",
  completed: "Completed",
  closed: "Closed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
  no_show: "No show",
}

export const STATUS_TONE: Record<TripStatus, "default" | "secondary" | "destructive" | "outline"> = {
  requested: "default",
  confirmed: "secondary",
  assigned: "secondary",
  driver_en_route: "secondary",
  arrived: "secondary",
  in_trip: "secondary",
  completed: "outline",
  closed: "outline",
  rejected: "destructive",
  cancelled: "outline",
  expired: "destructive",
  no_show: "destructive",
}

export const OPERATOR_EVENT: Record<string, string> = {
  created: "Booking created",
  accepted: "Accepted",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
  quote_adjusted: "Fare adjusted",
  hold_alert: "Reminder to answer",
}

export const tripTypeLabel = (t: keyof typeof TRIP_TYPE_LABEL) => TRIP_TYPE_LABEL[t]
