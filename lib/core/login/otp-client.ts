"use client"

import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check"
import { RecaptchaVerifier, connectAuthEmulator, signInWithPhoneNumber, signOut, type Auth, type ConfirmationResult } from "firebase/auth"

import { type FirebaseWebConfig, getFirebaseAuth } from "@/lib/firebase/client"
import type { OtpProviderName } from "./otp-provider"

/** The browser half of a one-time-code provider. Firebase today; an SMS gateway later behind the same shape. */
export interface PhoneOtpClient {
  readonly name: OtpProviderName
  /** Sends the code to an E.164 number. Rejects with an error the page turns into a message. */
  send(phoneE164: string): Promise<void>
  /** Checks the code the person typed and returns the proof the server will verify. */
  confirm(code: string): Promise<string>
  /** Throws away any half-finished attempt. */
  reset(): void
}

export const INDIA_MOBILE = /^\+91[6-9][0-9]{9}$/

let emulatorConnected = false
const appChecked = new Set<string>()

export type FirebaseOtpOptions = {
  config: FirebaseWebConfig
  /** "127.0.0.1:9099" when the Auth emulator is in use (development only). */
  emulator: string | null
  /** The reCAPTCHA Enterprise site key for App Check. Without it the page still works, with App Check unenforced. */
  appCheckSiteKey: string | null
  /** Where the invisible reCAPTCHA mounts. */
  container: () => HTMLElement | null
}

export function createFirebaseOtpClient(opts: FirebaseOtpOptions): PhoneOtpClient {
  let confirmation: ConfirmationResult | null = null
  let verifier: RecaptchaVerifier | null = null
  let auth: Auth | null = null

  const getAuth = (): Auth => {
    if (auth) return auth
    const a = getFirebaseAuth(opts.config)
    if (opts.emulator) {
      if (!emulatorConnected) {
        connectAuthEmulator(a, `http://${opts.emulator}`, { disableWarnings: true })
        emulatorConnected = true
      }
    } else if (opts.appCheckSiteKey && !appChecked.has(a.app.name)) {
      // App Check must exist before the first Auth call, so Firebase can attach its token and refuse bots.
      initializeAppCheck(a.app, { provider: new ReCaptchaEnterpriseProvider(opts.appCheckSiteKey), isTokenAutoRefreshEnabled: true })
      appChecked.add(a.app.name)
    }
    auth = a
    return a
  }

  const reset = () => {
    verifier?.clear()
    verifier = null
    opts.container()?.replaceChildren()
  }

  return {
    name: "firebase",
    async send(phone) {
      if (!INDIA_MOBILE.test(phone)) throw { code: "auth/invalid-phone-number" }
      const a = getAuth()
      reset()
      const holder = document.createElement("div")
      opts.container()?.appendChild(holder)
      verifier = new RecaptchaVerifier(a, holder, { size: "invisible" })
      try {
        confirmation = await signInWithPhoneNumber(a, phone, verifier)
      } catch (e) {
        reset()
        throw e
      }
    },
    async confirm(code) {
      if (!confirmation) throw { code: "auth/invalid-verification-code" }
      const idToken = await (await confirmation.confirm(code)).user.getIdToken()
      // The Firebase session only existed to prove the number; ours is separate.
      await signOut(getAuth())
      return idToken
    },
    reset() {
      confirmation = null
      reset()
    },
  }
}
