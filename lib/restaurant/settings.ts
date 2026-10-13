import { z } from "zod"

export const orderSettingsSchema = z.object({
  acceptingOrders: z.boolean().default(true),
  delivery: z.boolean().default(true),
  pickup: z.boolean().default(true),
  dineIn: z.boolean().default(false),
  /** Whole rupees. */
  deliveryFee: z.number().int().min(0).max(5000).default(0),
  freeDeliveryAbove: z.number().int().min(0).max(1_000_000).nullable().default(null),
  minOrder: z.number().int().min(0).max(1_000_000).default(0),
  /** Pay at the door or counter. */
  acceptCod: z.boolean().default(true),
  /** Pay in advance with Razorpay. Only offered once payouts are connected. */
  acceptOnline: z.boolean().default(true),
})
export type OrderSettings = z.infer<typeof orderSettingsSchema>

/** What a restaurant gets until its owner changes anything. Unknown or damaged stored values fall back to this. */
export function readOrderSettings(stored: unknown): OrderSettings {
  const parsed = orderSettingsSchema.safeParse(stored ?? {})
  return parsed.success ? parsed.data : orderSettingsSchema.parse({})
}

export const FULFILMENTS = ["delivery", "pickup", "dine_in"] as const
export type Fulfilment = (typeof FULFILMENTS)[number]
export const FULFILMENT_LABEL: Record<Fulfilment, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  dine_in: "Dine in",
}

export function enabledFulfilments(s: OrderSettings): Fulfilment[] {
  return FULFILMENTS.filter((f) => (f === "delivery" ? s.delivery : f === "pickup" ? s.pickup : s.dineIn))
}

export const PAYMENT_METHODS = ["cod", "online"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/**
 * The ways a guest can pay right now, best first: online (when the owner accepts it and payouts are connected), then
 * cash. The first one is what the checkout selects by default.
 */
export function paymentOptions(s: OrderSettings, onlineAvailable: boolean): PaymentMethod[] {
  const out: PaymentMethod[] = []
  if (s.acceptOnline && onlineAvailable) out.push("online")
  if (s.acceptCod) out.push("cod")
  return out.length ? out : ["cod"]
}
