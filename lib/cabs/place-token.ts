import { signToken, verifyToken } from "../core/login/sign"
import type { PlaceInput } from "./trip-quote"

/**
 * A place the customer chose, as the server saw it, sealed so the browser cannot edit it. The booking page holds only this sealed
 * string; the server opens it when pricing, so a forged state or place id can never change a fare or tax. Good for a day.
 */
const TTL_SECONDS = 86_400

type Sealed = PlaceInput & { exp: number }

export const sealPlace = (p: PlaceInput, now = Date.now()) => signToken("place", { ...p, exp: Math.floor(now / 1000) + TTL_SECONDS })

export async function openPlace(token: string | null | undefined, now = Date.now()): Promise<PlaceInput | null> {
  const s = await verifyToken<Sealed>("place", token, now)
  if (!s || typeof s.name !== "string" || typeof s.address !== "string") return null
  return { placeId: s.placeId ?? null, name: s.name, address: s.address, lat: s.lat ?? null, lng: s.lng ?? null, stateCode: s.stateCode ?? null }
}
