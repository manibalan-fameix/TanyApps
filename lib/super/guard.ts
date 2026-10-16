import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"
import { cache } from "react"

import { auth } from "../auth"
import {
  DEV_BYPASS_COOKIE,
  DEV_USER,
  isDevBypassEnabled,
} from "../auth/dev-bypass"
import {
  LOCAL_LOGIN_COOKIE,
  defaultLocalLoginEmail,
  emailFromLocalLoginCookie,
  isLocalPasswordLoginEnabled,
} from "../auth/local-login"

/**
 * Tany team accounts allowed into the super admin: SUPER_ADMIN_EMAILS (comma separated).
 * In development SEED_OWNER_EMAIL counts too, so the local login works without extra setup.
 */
export function superAdminEmails(): Set<string> {
  const list = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",")
  if (process.env.NODE_ENV === "development")
    list.push(defaultLocalLoginEmail(), DEV_USER.email)
  return new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))
}

const sessionEmail = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies()
  if (isLocalPasswordLoginEnabled()) {
    const email = emailFromLocalLoginCookie(
      cookieStore.get(LOCAL_LOGIN_COOKIE)?.value
    )
    if (email) return email
  }
  if (isDevBypassEnabled() && cookieStore.get(DEV_BYPASS_COOKIE))
    return DEV_USER.email
  const session = await auth()
  return session?.user?.email?.toLowerCase() ?? null
})

/**
 * For every super admin page and data function. Signed out goes to login; anyone who is not on the
 * Tany list gets a plain 404, so the area does not show up to dealers.
 */
export async function requireSuperAdmin() {
  const email = await sessionEmail()
  if (!email) redirect("/super/login")
  if (!superAdminEmails().has(email)) notFound()
  return { email }
}

/** The signed-in team member's email, or null. Never redirects: for the login page itself. */
export async function currentSuperAdmin() {
  const email = await sessionEmail()
  return email && superAdminEmails().has(email) ? email : null
}
