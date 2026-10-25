"use client"

import { CheckmarkCircle01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from "firebase/auth"
import { useEffect, useRef, useState } from "react"

import { verifyDealerPhone } from "@/app/(admin)/onboarding/actions"
import type { IndustryKey } from "@/lib/verticals/keys"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import {
  type FirebaseWebConfig,
  friendlyAuthError,
  getFirebaseAuth,
} from "@/lib/firebase/client"

const RESEND_SECONDS = 30

/**
 * The number buyers call, proved by a 6-digit code. The code goes through Firebase; the proof it returns is
 * checked on the server, which records the number. Nothing here is trusted on its own.
 */
export function PhoneVerify({
  config,
  testPhones,
  phone,
  onPhone,
  verified,
  onVerified,
  error,
  industry,
  notice,
}: {
  config: FirebaseWebConfig | null
  testPhones: string[]
  phone: string
  onPhone: (phone: string) => void
  /** The 10 digits already proved, or "". */
  verified: string
  onVerified: (phone: string) => void
  error?: string
  industry: IndustryKey
  notice?: string
}) {
  const [editing, setEditing] = useState(false)
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  )
  const [code, setCode] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(notice ?? null)
  const [problem, setProblem] = useState<string | null>(null)
  const verifier = useRef<RecaptchaVerifier | null>(null)
  const running = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // reCAPTCHA refuses to render twice into one element, so every attempt gets a fresh one.
  const resetRecaptcha = () => {
    verifier.current?.clear()
    verifier.current = null
    document.getElementById("phone-recaptcha")?.replaceChildren()
  }
  useEffect(() => resetRecaptcha, [])

  async function run(fn: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setProblem(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setProblem(friendlyAuthError(e))
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  const sendCode = () =>
    run(async () => {
      if (!config) throw new Error("not configured")
      if (!/^[6-9][0-9]{9}$/.test(phone))
        throw { code: "auth/invalid-phone-number" }
      const auth = getFirebaseAuth(config)
      auth.settings.appVerificationDisabledForTesting =
        testPhones.includes(phone)
      resetRecaptcha()
      const host = document.createElement("div")
      document.getElementById("phone-recaptcha")?.appendChild(host)
      verifier.current = new RecaptchaVerifier(auth, host, {
        size: "invisible",
      })
      try {
        setConfirmation(
          await signInWithPhoneNumber(auth, `+91${phone}`, verifier.current)
        )
      } catch (e) {
        resetRecaptcha()
        throw e
      }
      setCode("")
      setCooldown(RESEND_SECONDS)
      setMessage(`We sent a 6-digit code to +91 ${phone}.`)
    })

  const confirmCode = (value = code) =>
    run(async () => {
      if (!confirmation || !config || value.length !== 6) return
      const user = (await confirmation.confirm(value)).user
      const res = await verifyDealerPhone(await user.getIdToken(), industry)
      // This Firebase session only existed to prove the number; the app session is separate.
      await signOut(getFirebaseAuth(config))
      if (!res.ok) {
        // The code was right but the number was refused: close the popup and show why under the phone field.
        setConfirmation(null)
        return setProblem(res.error)
      }
      onVerified(res.phone)
      setMessage(res.notice ?? null)
      setConfirmation(null)
      setEditing(false)
    })

  const isMobile = useIsMobile()
  const onOtpOpenChange = (open: boolean) => {
    if (!open) setConfirmation(null)
  }
  const otpDescription = `We sent a code to +91 ${phone}.`
  const otpBody = (
    <>
      <InputOTP
        id="phone-otp"
        maxLength={6}
        containerClassName="w-full"
        value={code}
        onChange={setCode}
        onComplete={confirmCode}
        autoFocus
      >
        <InputOTPGroup className="w-full">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="h-12 flex-1" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {problem ? (
        <Alert variant="destructive" className="w-full min-w-0">
          <AlertDescription className="[overflow-wrap:anywhere]">{problem}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        className="w-full"
        disabled={busy || code.length !== 6}
        onClick={() => confirmCode()}
      >
        {busy ? "Checking..." : "Verify number"}
      </Button>
      <div className="mt-3 flex w-full justify-between text-sm">
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
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </>
  )

  if (verified && phone === verified && !editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            strokeWidth={2}
            className="size-5 shrink-0 text-primary"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">+91 {phone}</p>
            <p className="text-xs text-muted-foreground">
              Verified. Buyers will call this number.
            </p>
            {message ? (
              <p className="text-xs text-muted-foreground">{message}</p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
          >
            Change
          </Button>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div id="phone-recaptcha" className="absolute" />
      {!confirmation ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">+91</span>
          <Input
            id="phone"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => onPhone(e.target.value.replace(/\D/g, ""))}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy || phone.length !== 10 || !config}
            onClick={sendCode}
          >
            {busy ? "Sending..." : "Send code"}
          </Button>
        </div>
      ) : null}
      {isMobile ? (
        <Sheet open={!!confirmation} onOpenChange={onOtpOpenChange}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-6">
            <SheetHeader>
              <SheetTitle>Enter the 6-digit code</SheetTitle>
              <SheetDescription>{otpDescription}</SheetDescription>
            </SheetHeader>
            <div className="flex w-full min-w-0 flex-col items-center gap-3 px-4">
              {otpBody}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={!!confirmation} onOpenChange={onOtpOpenChange}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Enter the 6-digit code</DialogTitle>
              <DialogDescription>{otpDescription}</DialogDescription>
            </DialogHeader>
            <div className="flex w-full min-w-0 flex-col items-center gap-3">
              {otpBody}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {message && !problem && !confirmation ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
      {!config ? (
        <p className="text-xs text-destructive">
          Phone verification is not set up yet.
        </p>
      ) : null}
      {(confirmation ? error : (problem ?? error)) ? (
        <Alert variant="destructive">
          <AlertDescription>
            {confirmation ? error : (problem ?? error)}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
