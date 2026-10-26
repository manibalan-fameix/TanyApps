import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"

/** What we keep from a verified Firebase ID token. */
export type FirebaseIdentity = {
  uid: string
  email: string | null
  emailVerified: boolean
  phone: string | null
  name: string | null
  picture: string | null
  /** "google.com", "password" or "phone". */
  provider: string
}

// Firebase signs ID tokens with Google's securetoken keys. jose caches and rotates them.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
)

export const firebaseProjectId = () => process.env.FIREBASE_PROJECT_ID?.trim() || undefined

/** The public web config the browser SDK needs. Read at request time, so no rebuild is needed to change it. */
export function getFirebaseWebConfig() {
  const { FIREBASE_API_KEY: apiKey, FIREBASE_AUTH_DOMAIN: authDomain, FIREBASE_APP_ID: appId } = process.env
  const projectId = firebaseProjectId()
  if (!apiKey || !projectId || !appId) return null
  return { apiKey, projectId, appId, authDomain: authDomain || `${projectId}.firebaseapp.com` }
}

/**
 * Verifies signature, issuer, audience and expiry. Returns null for anything invalid; never throws.
 * `keys` is injectable so tests can sign tokens locally.
 */
export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string | undefined = firebaseProjectId(),
  keys: JWTVerifyGetKey = JWKS,
): Promise<FirebaseIdentity | null> {
  if (!projectId || !idToken) return null
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    })
    // `sub` is the Firebase uid and must be present and non-empty.
    if (typeof payload.sub !== "string" || !payload.sub) return null
    const firebase = (payload.firebase ?? {}) as { sign_in_provider?: string }
    const str = (v: unknown) => (typeof v === "string" && v ? v : null)
    return {
      uid: payload.sub,
      email: str(payload.email)?.toLowerCase() ?? null,
      emailVerified: payload.email_verified === true,
      phone: str(payload.phone_number),
      name: str(payload.name),
      picture: str(payload.picture),
      provider: firebase.sign_in_provider ?? "unknown",
    }
  } catch {
    return null
  }
}

/** The address Firebase itself vouches for in this token: the email only when `email_verified` is true, otherwise nothing. */
export const verifiedEmailOf = (identity: Pick<FirebaseIdentity, "email" | "emailVerified">): string | null =>
  identity.emailVerified && identity.email ? identity.email : null
