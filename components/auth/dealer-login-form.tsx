"use client"

import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth"
import { cn } from "cn"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { SmartPhone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  type EmailPasswordLoginState,
  firebaseAccountExists,
  signInTeammate,
  signInWithEmailPassword,
  signInWithFirebaseToken,
} from "@/lib/auth/actions"
import {
  type FirebaseWebConfig,
  friendlyAuthError,
  getFirebaseAuth,
} from "@/lib/firebase/client"

const RESEND_SECONDS = 30
const initialState: EmailPasswordLoginState = {}

const REDIRECT_MODE_KEY = "tany:auth-redirect-mode"

/**
 * shadcn `login-03`. Google and email/password sign in through Firebase; when local password login is enabled
 * (development) the email/password form posts to the local server action instead.
 */
export function DealerLoginForm({
  config,
  localEmail,
  testPhones = [],
  className,
  ...props
}: React.ComponentProps<"div"> & {
  config: FirebaseWebConfig | null
  localEmail?: string
  testPhones?: string[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [localState, localAction, localPending] = useActionState(
    signInWithEmailPassword,
    initialState
  )
  // Dev password login only applies to logging in; creating an account always goes through Firebase.
  const local = localEmail !== undefined && mode === "signin"

  async function finish(user: User, forMode: "signin" | "signup" = mode) {
    const auth = getFirebaseAuth(config!)
    const idToken = await user.getIdToken()
    // Logging in never creates an account: unknown users are pointed to "Create dealer account".
    // Exception: an email that was just verified is the second half of sign-up, so it continues to onboarding.
    if (forMode === "signin" && !(await firebaseAccountExists(idToken))) {
      if (
        user.providerData[0]?.providerId === "password" &&
        user.emailVerified
      ) {
        forMode = "signup"
      } else {
        await firebaseSignOut(auth)
        setConfirmation(null)
        setMode("signup")
        return setInfo(
          "We couldn't find a dealer account for this login. Create one below to get started."
        )
      }
    }
    const result = await signInWithFirebaseToken(idToken)
    await firebaseSignOut(auth)
    if (!result.ok) return setError(result.error)
    router.replace(forMode === "signup" ? "/onboarding" : "/dashboard")
    router.refresh()
  }

  // A second tap before `busy` re-renders would start another popup, which cancels the first (auth/cancelled-popup-request).
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

  // Safari only opens a popup while the tap's user gesture is alive. Firebase initialises lazily and that wait can
  // outlive the gesture, so warm the auth instance up front and let the click call signInWithPopup immediately.
  useEffect(() => {
    if (config) void getFirebaseAuth(config).authStateReady()
  }, [config])

  // Coming back from the redirect fallback below: complete the sign-in in the mode the dealer started from.
  useEffect(() => {
    if (!config) return
    let pending: string | null = null
    try {
      pending = sessionStorage.getItem(REDIRECT_MODE_KEY)
    } catch {}
    if (!pending) return
    try {
      sessionStorage.removeItem(REDIRECT_MODE_KEY)
    } catch {}
    setMode(pending as "signin" | "signup")
    void run(async () => {
      const result = await getRedirectResult(getFirebaseAuth(config))
      if (result) await finish(result.user, pending as "signin" | "signup")
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const google = () =>
    run(async () => {
      const auth = getFirebaseAuth(config!)
      const provider = new GoogleAuthProvider()
      try {
        await finish((await signInWithPopup(auth, provider)).user)
      } catch (e) {
        // Popup blocked (common on mobile Safari): fall back to a full-page redirect.
        if ((e as { code?: string })?.code !== "auth/popup-blocked") throw e
        try {
          sessionStorage.setItem(REDIRECT_MODE_KEY, mode)
        } catch {}
        await signInWithRedirect(auth, provider)
      }
    })

  // ---- Phone ----
  const [method, setMethod] = useState<"email" | "phone">("email")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  )
  const [cooldown, setCooldown] = useState(0)
  const verifier = useRef<RecaptchaVerifier | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // reCAPTCHA refuses to render twice into one element, so every attempt gets a fresh one.
  const resetRecaptcha = () => {
    verifier.current?.clear()
    verifier.current = null
    document.getElementById("recaptcha-container")?.replaceChildren()
  }
  useEffect(() => resetRecaptcha, [])

  const sendCode = () =>
    run(async () => {
      const auth = getFirebaseAuth(config!)
      if (!/^[6-9][0-9]{9}$/.test(phone))
        throw { code: "auth/invalid-phone-number" }
      auth.settings.appVerificationDisabledForTesting =
        testPhones.includes(phone)
      resetRecaptcha()
      const host = document.createElement("div")
      document.getElementById("recaptcha-container")?.appendChild(host)
      verifier.current = new RecaptchaVerifier(auth, host, {
        size: "invisible",
      })
      try {
        setConfirmation(
          await signInWithPhoneNumber(auth, `+91${phone}`, verifier.current)
        )
      } catch (e) {
        resetRecaptcha() // a verifier cannot be reused after a failed attempt
        throw e
      }
      setCode("")
      setCooldown(RESEND_SECONDS)
      setInfo(`We sent a 6-digit code to +91 ${phone}.`)
    })

  const verifyCode = (value = code) =>
    run(async () => {
      if (!confirmation || value.length !== 6) return
      await finish((await confirmation.confirm(value)).user)
    })

  const switchMethod = (next: "email" | "phone") => {
    setMethod(next)
    setConfirmation(null)
    setError(null)
    setInfo(null)
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const email = String(data.get("email"))
    const password = String(data.get("password"))
    return run(async () => {
      const auth = getFirebaseAuth(config!)
      // A teammate whose owner set a password signs in here, without Firebase.
      if (mode === "signin" && (await signInTeammate(email, password))) {
        router.replace("/dashboard")
        router.refresh()
        return
      }
      if (mode === "signup") {
        if (password.length < 8) throw { code: "auth/weak-password" }
        let user: User
        try {
          user = (await createUserWithEmailAndPassword(auth, email, password))
            .user
        } catch (e) {
          if ((e as { code?: string }).code !== "auth/email-already-in-use")
            throw e
          // Sign-up was started before (e.g. the email is not confirmed yet): carry on with the same password.
          try {
            user = (await signInWithEmailAndPassword(auth, email, password))
              .user
          } catch {
            // Different password from the first attempt (or the account uses Google/phone).
            setMode("signin")
            return setError(
              "This email is already registered, possibly not confirmed yet. Log in with your original password to get a new confirmation link, or use Forgot password."
            )
          }
          if (user.emailVerified) return finish(user, "signin")
        }
        await sendEmailVerification(user)
        await firebaseSignOut(auth)
        setMode("signin")
        setInfo(
          "Account created. We sent a link to confirm your email. Open it, then log in."
        )
        return
      }
      let user: User
      try {
        user = (await signInWithEmailAndPassword(auth, email, password)).user
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code === "auth/user-not-found") {
          setMode("signup")
          return setInfo(
            "We couldn't find a dealer account for this email. Create one below to get started."
          )
        }
        throw e
      }
      if (!user.emailVerified) {
        await sendEmailVerification(user)
        await firebaseSignOut(auth)
        setInfo("Please confirm your email first. We just sent you a new link.")
        return
      }
      await finish(user)
    })
  }

  const forgot = (e: React.MouseEvent) => {
    e.preventDefault()
    const email = (document.getElementById("email") as HTMLInputElement | null)
      ?.value
    if (!email) return setError("Enter your email above first.")
    return run(async () => {
      await sendPasswordResetEmail(getFirebaseAuth(config!), email)
      setInfo(
        "If an account exists for that email, a reset link is on its way."
      )
    })
  }

  const message = (local ? localState.error : null) ?? error
  const enabled = !!config

  const card = (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {mode === "signup" ? "Create your dealer account" : "Welcome back"}
        </CardTitle>
        <CardDescription>
          {mode === "signup"
            ? "Sign up with Google, your phone number or email"
            : "Login with your Google account or phone number"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            // Dev password login is only for the seeded dev email; any other address signs in through Firebase.
            const typed = String(new FormData(e.currentTarget).get("email"))
              .trim()
              .toLowerCase()
            if (!local || (config && typed !== localEmail?.toLowerCase())) {
              e.preventDefault()
              void submit(e)
            }
          }}
          action={local ? localAction : undefined}
        >
          <FieldGroup>
            <Field>
              <Button
                variant="outline"
                type="button"
                className="h-11 text-base"
                onClick={google}
                disabled={busy || !enabled}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                {mode === "signup"
                  ? "Sign up with Google"
                  : "Login with Google"}
              </Button>
              <Button
                variant="outline"
                type="button"
                className="h-11 text-base"
                onClick={() =>
                  switchMethod(method === "phone" ? "email" : "phone")
                }
                disabled={busy || !enabled}
              >
                <HugeiconsIcon icon={SmartPhone01Icon} strokeWidth={2} />
                {method === "phone"
                  ? mode === "signup"
                    ? "Sign up with Email"
                    : "Login with Email"
                  : mode === "signup"
                    ? "Sign up with Phone"
                    : "Login with Phone"}
              </Button>
            </Field>
            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
              Or continue with
            </FieldSeparator>
            {method === "email" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    className="h-11 text-base"
                    key={local ? "local" : "remote"}
                    id="email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    defaultValue={local ? localEmail : ""}
                    required
                  />
                </Field>
                <Field>
                  <div className="flex items-center">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    {!local && mode === "signin" ? (
                      <a
                        href="#"
                        onClick={forgot}
                        className="ml-auto text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </a>
                    ) : null}
                  </div>
                  <Input
                    className="h-11 text-base"
                    id="password"
                    name="password"
                    type="password"
                    required
                  />
                </Field>
                <Field>
                  <Button
                    type="submit"
                    className="h-11 text-base"
                    disabled={busy || localPending || (!local && !enabled)}
                  >
                    {busy || localPending
                      ? "Please wait..."
                      : mode === "signup"
                        ? "Create account"
                        : "Login"}
                  </Button>
                  {message ? (
                    <p
                      role="alert"
                      className="text-center text-sm text-destructive"
                    >
                      {message}
                    </p>
                  ) : null}
                  {info ? (
                    <p
                      role="status"
                      className="text-center text-sm text-muted-foreground"
                    >
                      {info}
                    </p>
                  ) : null}
                </Field>
              </>
            ) : (
              <>
                {!confirmation ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="phone">Mobile number</FieldLabel>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          +91
                        </span>
                        <Input
                          className="h-11 text-base"
                          id="phone"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={10}
                          placeholder="98765 43210"
                          value={phone}
                          onChange={(e) =>
                            setPhone(e.target.value.replace(/\D/g, ""))
                          }
                        />
                      </div>
                    </Field>
                    <Field>
                      <Button
                        type="button"
                        className="h-11 text-base"
                        disabled={busy || phone.length !== 10}
                        onClick={sendCode}
                      >
                        {busy ? "Sending..." : "Send code"}
                      </Button>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field>
                      <FieldLabel htmlFor="otp">
                        Enter the 6-digit code
                      </FieldLabel>
                      <InputOTP
                        id="otp"
                        maxLength={6}
                        value={code}
                        onChange={setCode}
                        onComplete={verifyCode}
                        autoFocus
                      >
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="h-11 w-11"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </Field>
                    <Field>
                      <Button
                        type="button"
                        className="h-11 text-base"
                        disabled={busy || code.length !== 6}
                        onClick={() => verifyCode()}
                      >
                        {busy ? "Checking..." : "Verify and continue"}
                      </Button>
                      <div className="flex justify-between text-sm">
                        <button
                          type="button"
                          className="text-muted-foreground underline underline-offset-4"
                          onClick={() => setConfirmation(null)}
                        >
                          Change number
                        </button>
                        <button
                          type="button"
                          className="underline underline-offset-4 disabled:text-muted-foreground disabled:no-underline"
                          disabled={cooldown > 0 || busy}
                          onClick={sendCode}
                        >
                          {cooldown > 0
                            ? `Resend in ${cooldown}s`
                            : "Resend code"}
                        </button>
                      </div>
                    </Field>
                  </>
                )}
                {message ? (
                  <p
                    role="alert"
                    className="text-center text-sm text-destructive"
                  >
                    {message}
                  </p>
                ) : null}
                {info ? (
                  <p
                    role="status"
                    className="text-center text-sm text-muted-foreground"
                  >
                    {info}
                  </p>
                ) : null}
                <div id="recaptcha-container" />
              </>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center">
        <Link href="/" aria-label="TanyApps">
          <Logo className="h-10" />
        </Link>
      </div>
      {config ? (
        <Tabs
          className="w-full gap-4"
          value={mode}
          onValueChange={(value) => {
            setMode(value as "signin" | "signup")
            setConfirmation(null)
            setError(null)
            setInfo(null)
          }}
        >
          <TabsList className="h-12 w-full bg-foreground/10">
            <TabsTrigger className="text-base" value="signin" disabled={busy}>
              Log in
            </TabsTrigger>
            <TabsTrigger className="text-base" value="signup" disabled={busy}>
              Create dealer account
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin">{card}</TabsContent>
          <TabsContent value="signup">{card}</TabsContent>
        </Tabs>
      ) : (
        card
      )}
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </FieldDescription>
    </div>
  )
}
