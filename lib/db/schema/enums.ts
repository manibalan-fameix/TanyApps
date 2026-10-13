import { pgEnum } from "drizzle-orm/pg-core"

import { CAR_ANGLES } from "../../angles.ts"
export { CAR_ANGLES, type CarAngle } from "../../angles.ts"

export const dealerRole = pgEnum("dealer_role", ["owner", "staff"])
export const carStatus = pgEnum("car_status", ["draft", "live", "on_hold", "sold", "archived"])
export const mediaKind = pgEnum("media_kind", ["photo", "video"])
export const mediaStatus = pgEnum("media_status", ["pending", "uploaded", "processing", "ready", "failed"])
export const leadSource = pgEnum("lead_source", ["test_drive", "enquiry", "hold"])
export const leadStatus = pgEnum("lead_status", ["new", "contacted", "visited", "won", "lost"])
export const priceEventType = pgEnum("price_event_type", ["listed", "price_changed", "sold"])
export const bookingStatus = pgEnum("booking_status", ["created", "paid", "failed", "refunded", "cancelled"])

export const mediaAngle = pgEnum("media_angle", CAR_ANGLES)
