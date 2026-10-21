"use client"

import { RecaptchaVerifier, connectAuthEmulator, signInWithPhoneNumber, signOut, type ConfirmationResult } from "firebase/auth"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { type FirebaseWebConfig, friendlyAuthError, getFirebaseAuth } from "@/lib/firebase/client"

type Lang = "en" | "ta"

// Tamil strings are for a Tamil speaker to review before launch.
const T: Record<Lang, Record<string, string>> = {
  en: { title: "Sign in to book", phone: "Mobile number", send: "Send code", sent: "We sent a 6-digit code to", verify: "Verify", checking: "Checking...", resend: "Resend code", resendIn: "Resend in", change: "Change number", bad: "Enter a valid 10-digit mobile number.", fail: "Could not sign you in. Please try again.", off: "Sign-in is not available right now." },
  ta: { title: "முன்பதிவு செய்ய உள்நுழைக", phone: "மொபைல் எண்", send: "குறியீட்டை அனுப்புக", sent: "6 இலக்கக் குறியீடு அனுப்பப்பட்டது:", verify: "சரிபார்க்க", checking: "சரிபார்க்கிறது...", resend: "மீண்டும் அனுப்புக", resendIn: "மீண்டும் அனுப்ப", change: "எண்ணை மாற்றுக", bad: "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.", fail: "உள்நுழைய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.", off: "உள்நுழைவு தற்போது கிடைக்கவில்லை." },
}

let emulatorConnected = false

/**
 * Phone, then a 6-digit code through Firebase (invisible reCAPTCHA), then the server swaps the proof for a one-minute ticket for
 * the business's own site and the browser goes there. The Firebase session itself is thrown away straight after.
 */
export function OtpLogin({ config, emulator, host, state, next, lang }: { config: FirebaseWebConfig | null; emulator: string | null; host: string; state: string; next: string; lang: Lang }) {
  const t = T[lang]
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const verifier = useRef<RecaptchaVerifier | null>(null)
  const running = useRef(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const resetRecaptcha = () => {
    verifier.current?.clear()
    verifier.current = null
    document.getElementById("login-recaptcha")?.replaceChildren()
  }
  useEffect(() => resetRecaptcha, [])

  const auth = () => {
    const a = getFirebaseAuth(config!)
    if (emulator && !emulatorConnected) {
      connectAuthEmulator(a, `http://${emulator}`, { disableWarnings: true })
      emulatorConnected = true
    }
    return a
  }

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
      if (!config) throw new Error("off")
      if (!/^[6-9][0-9]{9}$/.test(phone)) return setProblem(t.bad)
      const a = auth()
      resetRecaptcha()
      const el = document.createElement("div")
      document.getElementById("login-recaptcha")?.appendChild(el)
      verifier.current = new RecaptchaVerifier(a, el, { size: "invisible" })
      try {
        setConfirmation(await signInWithPhoneNumber(a, `+91${phone}`, verifier.current))
      } catch (e) {
        resetRecaptcha()
        throw e
      }
      setCode("")
      setCooldown(30)
    })

  const confirmCode = (value = code) =>
    run(async () => {
      if (!confirmation || !config || value.length !== 6) return
      const idToken = await (await confirmation.confirm(value)).user.getIdToken()
      await signOut(auth())
      const res = await fetch("/api/id/ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken, host, state, next }) })
      const data = (await res.json().catch(() => null)) as { ok: boolean; url?: string } | null
      if (!res.ok || !data?.ok || !data.url) return setProblem(res.status === 429 ? friendlyAuthError({ code: "auth/too-many-requests" }) : t.fail)
      window.location.assign(data.url)
    })

  if (!config) return <p className="text-center text-sm text-muted-foreground">{t.off}</p>

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <div id="login-recaptcha" />
      {confirmation ? (
        <>
          <p className="text-sm text-muted-foreground">{t.sent} +91 {phone}</p>
          <InputOTP id="login-otp" maxLength={6} value={code} onChange={setCode} onComplete={confirmCode} autoFocus>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} className="h-11 w-11" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button type="button" className="h-11" disabled={busy || code.length !== 6} onClick={() => confirmCode()}>
            {busy ? t.checking : t.verify}
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-muted-foreground underline underline-offset-4" onClick={() => setConfirmation(null)}>
              {t.change}
            </button>
            <button type="button" className="underline underline-offset-4 disabled:text-muted-foreground disabled:no-underline" disabled={cooldown > 0 || busy} onClick={sendCode}>
              {cooldown > 0 ? `${t.resendIn} ${cooldown}s` : t.resend}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="text-sm font-medium" htmlFor="login-phone">
            {t.phone}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">+91</span>
            <Input id="login-phone" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} className="h-11 text-base" />
          </div>
          <Button type="button" className="h-11" disabled={busy} onClick={sendCode}>
            {t.send}
          </Button>
        </>
      )}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
