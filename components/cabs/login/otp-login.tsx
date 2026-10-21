"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { bookingText } from "@/lib/cabs/booking-copy"
import { type PhoneOtpClient, createFirebaseOtpClient } from "@/lib/core/login/otp-client"
import { type FirebaseWebConfig, friendlyAuthError } from "@/lib/firebase/client"

type Lang = "en" | "ta"

/**
 * Phone, then a 6-digit code (invisible reCAPTCHA and App Check through Firebase), then the server swaps the proof for a one-minute
 * ticket for the business's own site and the browser goes there. Only +91 numbers are accepted, here and again on the server.
 */
export function OtpLogin({ config, emulator, appCheckSiteKey, host, state, next, lang }: { config: FirebaseWebConfig | null; emulator: string | null; appCheckSiteKey: string | null; host: string; state: string; next: string; lang: Lang }) {
  const c = bookingText(lang)
  const t = { title: c.loginTitle, phone: c.loginPhone, send: c.loginSend, sent: c.loginSent, verify: c.loginVerify, checking: c.loginChecking, resend: c.loginResend, resendIn: c.loginResendIn, change: c.loginChange, bad: c.loginBad, fail: c.loginFail, off: c.loginOff }
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const running = useRef(false)

  const otp = useMemo<PhoneOtpClient | null>(
    () => (config ? createFirebaseOtpClient({ config, emulator, appCheckSiteKey, container: () => document.getElementById("login-recaptcha") }) : null),
    [config, emulator, appCheckSiteKey],
  )
  useEffect(() => () => otp?.reset(), [otp])
  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

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
      if (!otp) throw new Error("off")
      if (!/^[6-9][0-9]{9}$/.test(phone)) return setProblem(t.bad)
      await otp.send(`+91${phone}`)
      setSent(true)
      setCode("")
      setCooldown(30)
    })

  const confirmCode = (value = code) =>
    run(async () => {
      if (!otp || value.length !== 6) return
      const idToken = await otp.confirm(value)
      const res = await fetch("/api/id/ticket", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: otp.name, idToken, host, state, next }) })
      const data = (await res.json().catch(() => null)) as { ok: boolean; url?: string } | null
      if (!res.ok || !data?.ok || !data.url) return setProblem(res.status === 429 ? friendlyAuthError({ code: "auth/too-many-requests" }) : t.fail)
      window.location.assign(data.url)
    })

  if (!config) return <p className="text-center text-sm text-muted-foreground">{t.off}</p>

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <div id="login-recaptcha" />
      {sent ? (
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
            <button type="button" className="text-muted-foreground underline underline-offset-4" onClick={() => { otp?.reset(); setSent(false) }}>
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
