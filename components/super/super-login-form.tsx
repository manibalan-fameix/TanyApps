"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
} from "firebase/auth"

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
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { signInSuperAdmin, signInSuperAdminLocal } from "@/lib/super/actions"
import {
  type FirebaseWebConfig,
  friendlyAuthError,
  getFirebaseAuth,
} from "@/lib/firebase/client"

/** Google sign-in for the Tany team, in the same card as the dealer login. */
export function SuperLoginForm({
  config,
  localEmail,
}: {
  config: FirebaseWebConfig | null
  localEmail?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [localState, localAction, localPending] = useActionState(
    signInSuperAdminLocal,
    {}
  )
  const running = useRef(false)

  async function finish(idToken: string) {
    const auth = getFirebaseAuth(config!)
    const result = await signInSuperAdmin(idToken)
    await firebaseSignOut(auth)
    if (!result.ok) return setError(result.error)
    router.replace("/super")
    router.refresh()
  }

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

  // Warm Firebase up so the click can open the popup inside the user gesture (Safari).
  useEffect(() => {
    if (config) void getFirebaseAuth(config).authStateReady()
  }, [config])

  // Back from the redirect fallback below.
  useEffect(() => {
    if (!config) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run(async () => {
      const result = await getRedirectResult(getFirebaseAuth(config))
      if (result) await finish(await result.user.getIdToken())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const google = () =>
    run(async () => {
      const auth = getFirebaseAuth(config!)
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: "select_account" })
      try {
        await finish(
          await (await signInWithPopup(auth, provider)).user.getIdToken()
        )
      } catch (e) {
        if ((e as { code?: string })?.code !== "auth/popup-blocked") throw e
        await signInWithRedirect(auth, provider)
      }
    })

  // Development shortcut: the shared local password. Everywhere else, and for creating a password, Firebase.
  const local = localEmail !== undefined && mode === "signin"

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const email = String(data.get("email")).trim()
    const password = String(data.get("password"))
    return run(async () => {
      const auth = getFirebaseAuth(config!)
      if (mode === "signup") {
        if (password.length < 8) throw { code: "auth/weak-password" }
        let user
        try {
          user = (await createUserWithEmailAndPassword(auth, email, password))
            .user
        } catch (e) {
          if ((e as { code?: string }).code !== "auth/email-already-in-use")
            throw e
          user = (await signInWithEmailAndPassword(auth, email, password)).user
          if (user.emailVerified) return finish(await user.getIdToken())
        }
        await sendEmailVerification(user)
        await firebaseSignOut(auth)
        setMode("signin")
        return setInfo(
          "Password set. We sent a link to confirm your email. Open it, then log in."
        )
      }
      const user = (await signInWithEmailAndPassword(auth, email, password))
        .user
      if (!user.emailVerified) {
        await sendEmailVerification(user)
        await firebaseSignOut(auth)
        return setInfo(
          "Please confirm your email first. We just sent you a new link."
        )
      }
      await finish(await user.getIdToken())
    })
  }

  const forgot = () => {
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
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2">
          <Logo />
        </div>
        <CardTitle className="text-xl">Tany super admin</CardTitle>
        <CardDescription>For the Tany team only.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full text-base"
              disabled={!config || busy}
              onClick={google}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="size-5"
              >
                <path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill="currentColor"
                />
              </svg>
              {busy ? "Signing in…" : "Continue with Google"}
            </Button>
          </Field>
          <FieldSeparator>Or use a password</FieldSeparator>
          <form
            action={local ? localAction : undefined}
            onSubmit={local ? undefined : submit}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={localEmail}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" name="password" type="password" required />
              </Field>
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={localPending || busy || (!local && !config)}
              >
                {mode === "signup" ? "Set password" : "Log in"}
              </Button>
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  className="text-muted-foreground underline"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin")
                    setError(null)
                    setInfo(null)
                  }}
                >
                  {mode === "signin"
                    ? "First time? Set a password"
                    : "Back to log in"}
                </button>
                {mode === "signin" ? (
                  <button
                    type="button"
                    className="text-muted-foreground underline"
                    onClick={forgot}
                  >
                    Forgot password
                  </button>
                ) : null}
              </div>
            </FieldGroup>
          </form>
          {local ? (
            <p className="text-center text-xs text-muted-foreground">
              Development: the local password works here.
            </p>
          ) : null}
          {info ? (
            <p className="text-center text-sm text-muted-foreground">{info}</p>
          ) : null}
          {message ? (
            <p role="alert" className="text-center text-sm text-destructive">
              {message}
            </p>
          ) : null}
          {!config ? (
            <p className="text-center text-sm text-muted-foreground">
              Sign-in is not configured yet.
            </p>
          ) : null}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
