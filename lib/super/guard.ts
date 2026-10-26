import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"
import { cache } from "react"

import { superAdminEmails, superAdminUids } from "./emails"

import { auth } from "../auth"
import {
  DEV_BYPASS_COOKIE,
  DEV_USER,
  isDevBypassEnabled,
} from "../auth/dev-bypass"
import {
  LOCAL_LOGIN_COOKIE,
  emailFromLocalLoginCookie,
  isLocalPasswordLoginEnabled,
} from "../auth/local-login"

export { superAdminEmails } from "./emails"

type Identity = { email: string; uid: string | null; dev: boolean }

const sessionIdentity = cache(async (): Promise<Identity | null> => {
  const cookieStore = await cookies()
  if (isLocalPasswordLoginEnabled()) {
    const email = emailFromLocalLoginCookie(
      cookieStore.get(LOCAL_LOGIN_COOKIE)?.value
    )
    if (email) return { email, uid: null, dev: true }
  }
  if (isDevBypassEnabled() && cookieStore.get(DEV_BYPASS_COOKIE))
    return { email: DEV_USER.email, uid: null, dev: true }
  // Identity comes only from what Firebase verified at sign-in (see lib/auth/session-claims.ts), never from a profile field.
  const session = (await auth()) as { verifiedEmail?: string | null; verifiedUid?: string | null } | null
  const email = session?.verifiedEmail?.toLowerCase()
  return email ? { email, uid: session?.verifiedUid ?? null, dev: false } : null
})

/** On the team list, and (when SUPER_ADMIN_UIDS is set) signed in as one of the listed Firebase uids. Dev sign-ins have no uid. */
function allowed(id: Identity): boolean {
  if (!superAdminEmails().has(id.email)) return false
  const uids = superAdminUids()
  return id.dev || uids.size === 0 || (id.uid !== null && uids.has(id.uid))
}

/**
 * For every super admin page and data function. Signed out goes to login; anyone who is not on the
 * Tany list gets a plain 404, so the area does not show up to dealers.
 */
export async function requireSuperAdmin() {
  const id = await sessionIdentity()
  if (!id) redirect("/super/login")
  if (!allowed(id)) notFound()
  return { email: id.email }
}

/** The signed-in team member's email, or null. Never redirects: for the login page itself. */
export async function currentSuperAdmin() {
  const id = await sessionIdentity()
  return id && allowed(id) ? id.email : null
}

/** Who is acting, for the security trail: the verified team email and the Firebase uid (null for a development sign-in). Requires the guard. */
export async function superAdminActor(): Promise<{ email: string; uid: string | null }> {
  const { email } = await requireSuperAdmin()
  const id = await sessionIdentity()
  return { email, uid: id?.uid ?? null }
}
