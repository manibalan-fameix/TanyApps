import { z } from "zod"

import { validCoords } from "../core/geo/validate"

/** The most addresses one customer can keep at one business. */
export const MAX_SAVED_ADDRESSES = 10

export const ADDRESS_LABELS = ["Home", "Work", "Other"] as const

/**
 * What a customer fills in to save a delivery address. The map pin is required: it is what the rider navigates to.
 * The field limits keep the joined line within the 300 characters an order accepts.
 */
export const savedAddressSchema = z
  .object({
    label: z.string().trim().min(1, "Give this address a name.").max(40),
    house: z.string().trim().min(1, "Enter your flat or door number.").max(60),
    street: z.string().trim().min(5, "Enter your building, street and area.").max(150),
    landmark: z.string().trim().max(70).default(""),
    pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter your 6-digit pincode."),
    lat: z.number({ error: "Put the pin on your door." }),
    lng: z.number({ error: "Put the pin on your door." }),
  })
  .refine((a) => validCoords(a.lat, a.lng), { message: "We can only deliver within India.", path: ["lat"] })
export type SavedAddressInput = z.infer<typeof savedAddressSchema>

export type SavedAddress = SavedAddressInput & { id: string; /** The single line put on an order. */ line: string }

export const addressLine = (a: { house: string; street: string; landmark: string }) => [a.house, a.street, a.landmark ? `near ${a.landmark}` : ""].filter(Boolean).join(", ")

/** The text kept (encrypted) in customer_addresses.address_enc. The label and pin have their own columns. */
export const encodeAddress = (a: SavedAddressInput) => JSON.stringify({ house: a.house, street: a.street, landmark: a.landmark, pincode: a.pincode })

const stored = z.object({ house: z.string(), street: z.string(), landmark: z.string(), pincode: z.string() })

/** Rebuilds a saved address from its row and opened text. Null when the row is damaged or has no pin. */
export function decodeAddress(row: { id: string; label: string; lat: number | null; lng: number | null }, text: string | null): SavedAddress | null {
  if (!text || row.lat === null || row.lng === null) return null
  try {
    const parsed = stored.safeParse(JSON.parse(text))
    if (!parsed.success) return null
    return { id: row.id, label: row.label, lat: row.lat, lng: row.lng, ...parsed.data, line: addressLine(parsed.data) }
  } catch {
    return null
  }
}

/**
 * The saved address that a stored line and pincode came from, if any. A monthly plan keeps only that text, so this is how
 * it finds its map pin. `addresses` is newest first, so the newest wins when two read the same.
 */
export const matchingAddress = (addresses: SavedAddress[], to: { address: string; pincode: string }): SavedAddress | null => addresses.find((a) => a.line === to.address && a.pincode === to.pincode) ?? null
