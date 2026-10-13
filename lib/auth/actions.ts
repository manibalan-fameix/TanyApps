"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AuthError } from "next-auth"
import { eq } from "drizzle-orm"
import { z } from "zod"

import { unscopedDb } from "../db/client"
import { dealerUsers } from "../db/schema"

import { signIn, signOut } from "./index"
import { allow } from "../rate-limit"
import { verifyFirebaseIdToken } from "./firebase"
import { findFirebaseUser } from "./firebase-user"
import { DEV_BYPASS_COOKIE, isDevBypassEnabled } from "./dev-bypass"
import {
  LOCAL_LOGIN_COOKIE,
  ensureLocalDealerUser,
  isLocalPasswordLoginEnabled,
  localLoginCookieValue,
  localLoginPassword,
} from "./local-login"

export type EmailPasswordLoginState = { error?: string }

const emailPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

export type FirebaseSignInResult = { ok: true } | { ok: false; error: string }

/**
 * Whether a verified Firebase identity already has a dealer account here (a user who belongs to a dealership).
 * A user row without a dealership is an unfinished sign-up, so login offers "create account" instead.
 */
export async function firebaseAccountExists(idToken: string): Promise<boolean> {
  const identity = await verifyFirebaseIdToken(idToken)
  const user = identity ? await findFirebaseUser(identity) : null
  if (!user) return false
  const [membership] = await unscopedDb.select({ id: dealerUsers.userId }).from(dealerUsers).where(eq(dealerUsers.userId, user.id)).limit(1)
  return Boolean(membership)
}

/** Exchanges a Firebase ID token (from the browser SDK) for an app session. */
export async function signInWithFirebaseToken(idToken: string): Promise<FirebaseSignInResult> {
  try {
    await signIn("firebase", { idToken, redirect: false })
    return { ok: true }
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "We could not verify your sign-in. If you used email, confirm your email address first." }
    }
    throw error
  }
}

/**
 * Email + password for teammates whose owner set a password. Returns false for anyone else
 * (the caller then tries Firebase), so this never reveals whether an address exists.
 */
export async function signInTeammate(email: string, password: string): Promise<boolean> {
  const parsed = emailPasswordSchema.safeParse({ email, password })
  if (!parsed.success) return false
  if (!allow(`teammate-login:${parsed.data.email}`, 10, 10 * 60_000)) return false
  try {
    await signIn("teammate", { email: parsed.data.email, password: parsed.data.password, redirect: false })
    return true
  } catch (error) {
    if (error instanceof AuthError) return false
    throw error
  }
}

/** Dev only: open the in-memory demo dealer when Firebase is not configured. */
export async function openDevDemo() {
  if (!isDevBypassEnabled()) redirect("/login")
  ;(await cookies()).set(DEV_BYPASS_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/" })
  redirect("/dashboard")
}

export async function signInWithEmailPassword(
  _state: EmailPasswordLoginState,
  formData: FormData,
): Promise<EmailPasswordLoginState> {
  if (!isLocalPasswordLoginEnabled()) return { error: "Email login is only available in development." }

  const parsed = emailPasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: "Enter a valid email and password." }

  if (await signInTeammate(parsed.data.email, parsed.data.password)) redirect("/dashboard")

  if (parsed.data.password !== localLoginPassword()) return { error: "Incorrect password." }

  try {
    await ensureLocalDealerUser(parsed.data.email)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not prepare the local dealer account." }
  }

  const cookieStore = await cookies()
  cookieStore.delete(DEV_BYPASS_COOKIE)
  cookieStore.set(LOCAL_LOGIN_COOKIE, localLoginCookieValue(parsed.data.email), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  })
  redirect("/dashboard")
}

export async function signOutAction() {
  const cookieStore = await cookies()
  cookieStore.delete(DEV_BYPASS_COOKIE)
  cookieStore.delete(LOCAL_LOGIN_COOKIE)
  await signOut({ redirectTo: "/login" })
}
