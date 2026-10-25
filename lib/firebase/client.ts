"use client"

import { getApps, initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"

export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string }

export function getFirebaseAuth(config: FirebaseWebConfig) {
  // Keep Tany's auth instance isolated from any other Firebase app a host page
  // or hot-reload session may have initialized.
  const appName = `tany-${config.projectId}`
  const existing = getApps().find((candidate) => candidate.name === appName)
  const app = existing ?? initializeApp(config, appName)
  return getAuth(app)
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/wrong-password": "Incorrect email or password.",
  "auth/user-not-found": "Incorrect email or password.",
  "auth/email-already-in-use": "An account with this email already exists. Try signing in.",
  "auth/weak-password": "Use a password with at least 8 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/too-many-requests": "Firebase temporarily paused SMS requests for this number. Wait a few minutes, then request one fresh code.",
  "auth/invalid-phone-number": "Enter a valid 10-digit mobile number.",
  "auth/invalid-verification-code": "That code is not right. Check it and try again.",
  "auth/code-expired": "That code has expired. Request a new one.",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups and try again.",
  "auth/network-request-failed": "Network problem. Check your connection and try again.",
  "auth/unauthorized-domain": "This website is not authorised for sign-in yet.",
  "auth/account-exists-with-different-credential": "An account with this email already exists using another sign-in method. Log in with that one.",
  "auth/operation-not-allowed":
    "Firebase is blocking phone sign-in for this project. In Firebase Console, open Authentication → Sign-in method, keep Phone enabled, and allow India in Authentication → Settings → SMS regions.",
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
  const expected = cancelled || code === "auth/too-many-requests"
  if (process.env.NODE_ENV === "development" && !expected) console.error("Firebase auth error:", code, server ?? error)
  if (process.env.NODE_ENV === "development" && (!MESSAGES[code] || code === "auth/invalid-app-credential")) {
    // No code means it was not a Firebase error at all (a failed server action, a network drop): show its message.
    const detail = server ?? (code ? undefined : (error as Error)?.message)
    return `Firebase says: ${code || "(no code)"}${detail ? ` - ${detail}` : ""}`
  }
  return MESSAGES[code] ?? "Something went wrong. Please try again."
}
