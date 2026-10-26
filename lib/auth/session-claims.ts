import type { FirebaseIdentity } from "./firebase"
import { verifiedEmailOf } from "./firebase"

/**
 * The identity claims carried from a verified Firebase sign-in into the session. They are written in exactly one place (the
 * sign-in token), never taken from a profile row or from anything the client sends later, and read by the super admin guard.
 */
export type SessionClaims = { verifiedEmail: string | null; verifiedUid: string | null; /** E.164, present only for a Firebase phone sign-in (OTP-verified). */ verifiedPhone: string | null }

/** Email+password accounts must prove they own the address before they get any session. */
export const identityMaySignIn = (identity: Pick<FirebaseIdentity, "provider" | "emailVerified">): boolean =>
  !(identity.provider === "password" && !identity.emailVerified)

/** The user returned from a Firebase sign-in, with the claims the token itself proved. */
export const withVerifiedClaims = <U extends object>(user: U, identity: FirebaseIdentity): U & SessionClaims => ({
  ...user,
  verifiedEmail: verifiedEmailOf(identity),
  verifiedUid: identity.uid,
  verifiedPhone: identity.phone,
})

type Token = Record<string, unknown>

/** jwt callback: `user` is present only at sign-in. Providers that prove no identity (teammate password) store null claims. */
export function applySignInClaims<T extends Token>(token: T, user: object | null | undefined): T {
  if (!user) return token
  const claims = user as Partial<SessionClaims>
  const out: Token = token
  out.verifiedEmail = claims.verifiedEmail ?? null
  out.verifiedUid = claims.verifiedUid ?? null
  out.verifiedPhone = claims.verifiedPhone ?? null
  return token
}

/** session callback: read-only exposure of what the token holds. */
export function exposeClaims<S extends object>(session: S, token: Token): S & SessionClaims {
  const out = session as S & SessionClaims
  out.verifiedEmail = typeof token.verifiedEmail === "string" ? token.verifiedEmail : null
  out.verifiedUid = typeof token.verifiedUid === "string" ? token.verifiedUid : null
  out.verifiedPhone = typeof token.verifiedPhone === "string" ? token.verifiedPhone : null
  return out
}
