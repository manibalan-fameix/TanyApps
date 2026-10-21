import { decodeJwt } from "jose"

import { firebaseProjectId, verifyFirebaseIdToken } from "./firebase"

/** The Auth emulator is honoured only outside production, and only when its host variable is set. */
export const emulatorHost = (): string | null => (process.env.NODE_ENV !== "production" ? process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim() || null : null)

/**
 * The phone number a Firebase ID token proves, in E.164, or null. Real tokens are fully verified (signature, issuer, audience,
 * expiry). The emulator issues unsigned tokens, so with the emulator variable set (never in production) only the claims are checked.
 */
export async function verifiedPhone(idToken: string): Promise<string | null> {
  if (emulatorHost()) {
    try {
      const claims = decodeJwt(idToken)
      const project = firebaseProjectId()
      const phone = typeof claims.phone_number === "string" ? claims.phone_number : null
      const provider = (claims.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider
      const ok = project && claims.aud === project && claims.iss === `https://securetoken.google.com/${project}` && provider === "phone" && typeof claims.exp === "number" && claims.exp * 1000 > Date.now()
      return ok && phone ? phone : null
    } catch {
      return null
    }
  }
  const id = await verifyFirebaseIdToken(idToken)
  return id && id.provider === "phone" && id.phone ? id.phone : null
}
