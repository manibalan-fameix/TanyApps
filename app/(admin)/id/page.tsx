import { notFound } from "next/navigation"

import { OtpLogin } from "@/components/cabs/login/otp-login"
import { getFirebaseWebConfig } from "@/lib/auth/firebase"
import { emulatorHost } from "@/lib/auth/firebase-phone"
import { resolveLoginHost } from "@/lib/core/login/host"
import { safeNext } from "@/lib/core/login/ticket"
import { isLang } from "@/lib/cabs/lang"

export const metadata = { title: "Sign in", robots: { index: false } }
export const dynamic = "force-dynamic"

/** The one place customers prove their phone number. It only ever sends them back to a business that exists. */
export default async function CentralLogin({ searchParams }: { searchParams: Promise<{ host?: string; state?: string; next?: string; lang?: string }> }) {
  const q = await searchParams
  const target = await resolveLoginHost(q.host, "cabs")
  if (!target || !q.state || q.state.length < 16 || q.state.length > 64) notFound()
  const lang = q.lang && isLang(q.lang) ? q.lang : "en"
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted p-6">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6">
        <OtpLogin config={getFirebaseWebConfig()} emulator={emulatorHost()} host={target.host} state={q.state} next={safeNext(q.next)} lang={lang} />
      </div>
    </main>
  )
}
