"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { signIn } from "../auth"
import { DEV_BYPASS_COOKIE } from "../auth/dev-bypass"
import { verifyFirebaseIdToken } from "../auth/firebase"
import {
  LOCAL_LOGIN_COOKIE,
  isLocalPasswordLoginEnabled,
  localLoginCookieValue,
  localLoginPassword,
} from "../auth/local-login"
import { rateLimit } from "../core/rate-limit"
import { recordSecurityEventBestEffort } from "../core/security-audit"
import { superAdminEmails, superAdminUids } from "./emails"

export type SuperSignInResult = { ok: true } | { ok: false; error: string }

const NOT_ALLOWED = "This Google account is not on the Tany team list."

/**
 * Google sign-in for the Tany team. The Firebase token is verified here and the email must be on the team
 * list before any session starts, so a dealer or stranger never gets a session from this page.
 */
export async function signInSuperAdmin(
  idToken: string
): Promise<SuperSignInResult> {
  const identity = await verifyFirebaseIdToken(idToken)
  const email = identity?.emailVerified ? identity.email?.toLowerCase() : null
  const uids = superAdminUids()
  const refused = !email || !superAdminEmails().has(email) || (uids.size > 0 && !(identity && uids.has(identity.uid)))
  if (refused) {
    // Who tried is recorded as a short keyed fingerprint, never the address a stranger typed.
    await recordSecurityEventBestEffort({ actorType: "anonymous", action: "super.sign_in", targetType: "super_admin", outcome: "denied", metadata: { who: await fingerprint(identity?.email ?? identity?.uid ?? "unknown"), verified: Boolean(identity?.emailVerified) } })
    return { ok: false, error: NOT_ALLOWED }
  }
  try {
    await signIn("firebase", { idToken, redirect: false })
    await recordSecurityEventBestEffort({ actorType: "super_admin", actorId: identity!.uid, actorLabel: email, action: "super.sign_in", targetType: "super_admin", outcome: "success" })
    return { ok: true }
  } catch {
    await recordSecurityEventBestEffort({ actorType: "super_admin", actorId: identity!.uid, actorLabel: email, action: "super.sign_in", targetType: "super_admin", outcome: "failed" })
    return {
      ok: false,
      error: "We could not verify your sign-in. Please try again.",
    }
  }
}

async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.toLowerCase()))
  return Array.from(new Uint8Array(digest).slice(0, 6), (b) => b.toString(16).padStart(2, "0")).join("")
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

/** Development only: email + password for team emails, same as the local dealer login. */
export async function signInSuperAdminLocal(
  _state: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  if (!isLocalPasswordLoginEnabled())
    return { error: "Password login is only available in development." }
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: "Enter a valid email and password." }
  if (!(await rateLimit(`super-local:${parsed.data.email}`, 10, 10 * 60_000, { failClosed: true })))
    return { error: "Too many attempts. Wait a few minutes." }
  if (
    !superAdminEmails().has(parsed.data.email) ||
    parsed.data.password !== localLoginPassword()
  )
    return { error: "Incorrect email or password." }

  const cookieStore = await cookies()
  cookieStore.delete(DEV_BYPASS_COOKIE)
  cookieStore.set(
    LOCAL_LOGIN_COOKIE,
    localLoginCookieValue(parsed.data.email),
    { httpOnly: true, sameSite: "lax", path: "/" }
  )
  redirect("/super")
}
