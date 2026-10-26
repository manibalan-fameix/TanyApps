import { and, eq } from "drizzle-orm"

import { unscopedDb } from "../db/client"
import { accounts, users } from "../db/schema"
import { countMetric } from "../core/metrics"
import type { FirebaseIdentity } from "./firebase"

export type AuthUser = { id: string; name: string | null; email: string | null; image: string | null }

/**
 * Maps a verified Firebase identity to a user row.
 *  1. Known Firebase uid: that user.
 *  2. Verified email, or an OTP-verified phone, matching an existing user (e.g. a teammate the owner added): link to it.
 *  3. Otherwise create a new user. Phone-only sign-ins have no email.
 * An unverified email is never used to link, so nobody can claim someone else's account by typing their address.
 */
export async function findOrCreateFirebaseUser(identity: FirebaseIdentity): Promise<AuthUser | null> {
  const found = await locate(identity)
  if (!found) return createFirebaseUser(identity)
  await adoptVerifiedIdentity(found, identity)
  return toAuthUser(found.user)
}

/** Read-only lookup (steps 1 and 2 above); never creates or changes anything. */
export async function findFirebaseUser(identity: FirebaseIdentity): Promise<AuthUser | null> {
  const found = await locate(identity)
  return found ? toAuthUser(found.user) : null
}

type Located = { user: typeof users.$inferSelect; via: "uid" | "contact" }

async function locate(identity: FirebaseIdentity): Promise<Located | null> {
  const [linked] = await unscopedDb
    .select({ user: users })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.provider, "firebase"), eq(accounts.providerAccountId, identity.uid)))
    .limit(1)
  if (linked) return { user: linked.user, via: "uid" }

  const email = identity.emailVerified ? identity.email : null
  const byEmail = email ? (await unscopedDb.select().from(users).where(eq(users.email, email)).limit(1))[0] : undefined
  // A phone number in a Firebase token has always been verified by OTP.
  const byPhone = !byEmail && identity.phone ? (await unscopedDb.select().from(users).where(eq(users.phone, identity.phone)).limit(1))[0] : undefined
  const user = byEmail ?? byPhone
  return user ? { user, via: "contact" } : null
}

/**
 * The person has just proved control of this email or number, so the account now belongs to them. Two things follow, both only for
 * accounts an owner created for them before invitations existed:
 *  - their Firebase identity is linked, so later sign-ins find the account directly;
 *  - any password an owner set on the account is removed, so nobody but them can sign in to it.
 * Nothing else is touched, and an account that was never provisioned by an owner (no password) is left exactly as it was.
 */
async function adoptVerifiedIdentity({ user, via }: Located, identity: FirebaseIdentity): Promise<void> {
  if (via === "contact") {
    await unscopedDb.insert(accounts).values({ userId: user.id, type: "oidc", provider: "firebase", providerAccountId: identity.uid }).onConflictDoNothing()
  }
  if (user.passwordHash) {
    await unscopedDb.update(users).set({ passwordHash: null }).where(eq(users.id, user.id))
    countMetric("legacy_staff_identity_verified", { via })
  }
}

async function createFirebaseUser(identity: FirebaseIdentity): Promise<AuthUser> {
  const email = identity.emailVerified ? identity.email : null
  const [user] = await unscopedDb
    .insert(users)
    .values({
      name: identity.name,
      email,
      phone: identity.phone,
      emailVerified: email ? new Date() : null,
      image: identity.picture,
    })
    .returning()

  await unscopedDb
    .insert(accounts)
    .values({ userId: user.id, type: "oidc", provider: "firebase", providerAccountId: identity.uid })
    .onConflictDoNothing()
  return toAuthUser(user)
}

const toAuthUser = (u: typeof users.$inferSelect): AuthUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  image: u.image,
})
