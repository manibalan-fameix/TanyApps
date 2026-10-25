"use client"

import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  type AuthProvider,
  type User,
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth"
import { SmartPhone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useRef, useState } from "react"

import { OtpLogin } from "@/components/cabs/login/otp-login"
import { FacebookIcon, GoogleIcon } from "@/components/auth/social-icons"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"
import { type FirebaseWebConfig, friendlyAuthError, getFirebaseAuth } from "@/lib/firebase/client"

const REDIRECT_KEY = "tany:cab-login-redirect"

/**
 * The customer sign-in, laid out like the onboarding one: Google, Facebook, phone or email, then the fields. Phone stays the heart
 * of it: every customer of a business is identified by a verified mobile number, because the operator has to be able to call them.
 * So Google, Facebook and email sign in first, and a first-time sign-in then adds and verifies a phone, once, at this business.
 * What Firebase proves here never leaves this page except as a one-minute ticket for this one business.
 */
export function CustomerLoginForm({ config, emulator, appCheckSiteKey, host, state, next, lang, operator }: { config: FirebaseWebConfig | null; emulator: string | null; appCheckSiteKey: string | null; host: string; state: string; next: string; lang: Lang; operator: string }) {
  const t = bookingText(lang)
  const [method, setMethod] = useState<"phone" | "email">("phone")
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const running = useRef(false)

  async function run(fn: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(friendlyAuthError(e))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  /** A Firebase sign-in succeeded: trade it for a ticket (known here), or for a link that the phone step completes (new here). */
  async function finish(user: User) {
    const idToken = await user.getIdToken()
    // Nothing keeps a Firebase session on this page: the server is told once, then the browser forgets it.
    await firebaseSignOut(getFirebaseAuth(config!))
    const res = await fetch("/api/id/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken, host, state, next }) })
    const data = (await res.json().catch(() => null)) as { ok: boolean; url?: string; needsPhone?: boolean; link?: string } | null
    if (!res.ok || !data?.ok) return setError(res.status === 429 ? friendlyAuthError({ code: "auth/too-many-requests" }) : t.loginFail)
    if (data.url) return void window.location.assign(data.url)
    if (data.needsPhone && data.link) setLink(data.link)
  }

  // Safari only opens a popup while the tap's gesture is alive: warm the auth instance up so the click can open it immediately.
  useEffect(() => {
    if (config) void getFirebaseAuth(config).authStateReady()
  }, [config])

  // Back from the full-page redirect used when a popup is blocked (common on mobile Safari).
  useEffect(() => {
    if (!config) return
    let pending = false
    try {
      pending = sessionStorage.getItem(REDIRECT_KEY) === "1"
      sessionStorage.removeItem(REDIRECT_KEY)
    } catch {}
    if (!pending) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- finishing a redirect sign-in on arrival; sessionStorage only exists in the browser
    void run(async () => {
      const result = await getRedirectResult(getFirebaseAuth(config))
      if (result) await finish(result.user)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival
  }, [])

  const social = (provider: AuthProvider) =>
    run(async () => {
      const auth = getFirebaseAuth(config!)
      try {
        await finish((await signInWithPopup(auth, provider)).user)
      } catch (e) {
        if ((e as { code?: string })?.code !== "auth/popup-blocked") throw e
        try {
          sessionStorage.setItem(REDIRECT_KEY, "1")
        } catch {}
        await signInWithRedirect(auth, provider)
      }
    })
  const google = () => social(new GoogleAuthProvider())
  const facebook = () => {
    const provider = new FacebookAuthProvider()
    provider.addScope("email")
    return social(provider)
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const email = String(data.get("email")).trim()
    const password = String(data.get("password"))
    return run(async () => {
      const auth = getFirebaseAuth(config!)
      if (mode === "signup") {
        if (password.length < 8) throw { code: "auth/weak-password" }
        const user = (await createUserWithEmailAndPassword(auth, email, password)).user
        await sendEmailVerification(user)
        await firebaseSignOut(auth)
        setMode("signin")
        return setInfo(t.loginConfirmEmail)
      }
      const user = (await signInWithEmailAndPassword(auth, email, password)).user
      if (!user.emailVerified) {
        await sendEmailVerification(user)
        await firebaseSignOut(auth)
        return setInfo(t.loginConfirmEmail)
      }
      await finish(user)
    })
  }

  const forgot = (e: React.MouseEvent) => {
    e.preventDefault()
    const email = (document.getElementById("login-email") as HTMLInputElement | null)?.value.trim()
    if (!email) return setError(t.loginEmailFirst)
    return run(async () => {
      await sendPasswordResetEmail(getFirebaseAuth(config!), email)
      setInfo(t.loginResetSent)
    })
  }

  if (!config) return <p className="text-center text-sm text-muted-foreground">{t.loginOff}</p>

  // The sign-in is proved but new at this business: only a verified phone is missing.
  if (link) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-center">
          <h2 className="font-semibold">{t.loginAddPhone}</h2>
          <p className="text-sm text-muted-foreground">{t.loginAddPhoneSub.replace("{operator}", operator)}</p>
        </div>
        <OtpLogin config={config} emulator={emulator} appCheckSiteKey={appCheckSiteKey} host={host} state={state} next={next} lang={lang} link={link} />
        <button type="button" className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setLink(null)}>
          {t.loginOtherWay}
        </button>
      </div>
    )
  }

  const message = error
  return (
    <FieldGroup>
      <Field className="grid grid-cols-3 gap-3">
        <Button aria-label={t.loginWithGoogle} title={t.loginWithGoogle} variant="outline" type="button" className="h-11 text-base" onClick={google} disabled={busy}>
          <GoogleIcon />
        </Button>
        <Button aria-label={t.loginWithFacebook} title={t.loginWithFacebook} variant="outline" type="button" className="h-11 text-base" onClick={facebook} disabled={busy}>
          <FacebookIcon />
        </Button>
        <Button
          aria-label={method === "phone" ? t.loginUseEmail : t.loginUsePhone}
          title={method === "phone" ? t.loginUseEmail : t.loginUsePhone}
          variant="outline"
          type="button"
          className="h-11 text-base"
          onClick={() => {
            setMethod(method === "phone" ? "email" : "phone")
            setError(null)
            setInfo(null)
          }}
          disabled={busy}
        >
          {method === "phone" ? <span className="text-sm font-medium">@</span> : <HugeiconsIcon icon={SmartPhone01Icon} strokeWidth={2} />}
        </Button>
      </Field>
      <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">{t.loginOr}</FieldSeparator>

      {method === "phone" ? (
        <OtpLogin config={config} emulator={emulator} appCheckSiteKey={appCheckSiteKey} host={host} state={state} next={next} lang={lang} />
      ) : (
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="login-email">{t.loginEmail}</FieldLabel>
              <Input className="h-11 text-base" id="login-email" name="email" type="email" autoComplete="email" placeholder="m@example.com" required />
            </Field>
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="login-password">{t.loginPassword}</FieldLabel>
                {mode === "signin" ? (
                  <a href="#" onClick={forgot} className="ml-auto text-sm underline-offset-4 hover:underline">
                    {t.loginForgot}
                  </a>
                ) : null}
              </div>
              <Input className="h-11 text-base" id="login-password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
            </Field>
            <Field>
              <Button type="submit" className="h-11 text-base" disabled={busy}>
                {busy ? t.loginWait : mode === "signup" ? t.loginCreate : t.signIn}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {mode === "signup" ? t.loginHaveAccount : t.loginNoAccount}{" "}
                <button type="button" className="underline underline-offset-4" onClick={() => (setMode(mode === "signup" ? "signin" : "signup"), setError(null), setInfo(null))}>
                  {mode === "signup" ? t.signIn : t.loginSignUp}
                </button>
              </p>
            </Field>
          </FieldGroup>
        </form>
      )}

      {message ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {info ? (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {info}
        </p>
      ) : null}
    </FieldGroup>
  )
}
