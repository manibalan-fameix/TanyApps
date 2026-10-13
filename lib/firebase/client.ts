"use client"

import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"

export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string }

export function getFirebaseAuth(config: FirebaseWebConfig) {
  const app = getApps().length ? getApp() : initializeApp(config)
  return getAuth(app)
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
  "auth/weak-password": "Use a password with at least 8 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/invalid-phone-number": "Enter a valid 10-digit mobile number.",
  "auth/invalid-verification-code": "That code is not right. Check it and try again.",
  "auth/code-expired": "That code has expired. Request a new one.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "auth/unauthorized-domain": "This website is not authorised for sign-in yet.",
  "auth/operation-not-allowed": "This sign-in method is not enabled yet.",
  "auth/captcha-check-failed": "Security check failed. Refresh the page and try again.",
  "auth/missing-client-identifier": "Security check failed. Refresh the page and try again.",
  "auth/internal-error": "Sign-in service error. Please try again in a moment.",
  "auth/billing-not-enabled": "Phone sign-in is not available yet. Use Google or email.",
}

/** Turns a Firebase error into something a dealer can act on. Never shows raw codes. */
export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ""
  // Firebase's own reason (e.g. "INVALID_APP_CREDENTIAL : ..."), when the server sent one.
  const server = (error as { customData?: { _serverResponse?: { error?: { message?: string } } } })?.customData?._serverResponse?.error?.message
  const cancelled = code === "auth/cancelled-popup-request" || code === "auth/popup-closed-by-user"
  if (process.env.NODE_ENV === "development" && !cancelled) console.error("Firebase auth error:", code, server ?? error)
  if (process.env.NODE_ENV === "development" && (!MESSAGES[code] || code === "auth/invalid-app-credential")) {
    return `Firebase says: ${code}${server ? ` - ${server}` : ""}`
  }
  return MESSAGES[code] ?? "Something went wrong. Please try again."
}
