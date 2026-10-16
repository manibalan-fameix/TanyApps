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
import { allow } from "../rate-limit"
import { superAdminEmails } from "./guard"

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
  if (!email || !superAdminEmails().has(email))
    return { ok: false, error: NOT_ALLOWED }
  try {
    await signIn("firebase", { idToken, redirect: false })
    return { ok: true }
  } catch {
    return {
      ok: false,
      error: "We could not verify your sign-in. Please try again.",
    }
  }
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
  if (!allow(`super-local:${parsed.data.email}`, 10, 10 * 60_000))
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
