import type { CSSProperties } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { CustomerLoginForm } from "@/components/cabs/login/login-form"
import { DealerMark } from "@/components/dealer-mark"
import { PoweredBy } from "@/components/tenant/powered-by"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { bookingText } from "@/lib/cabs/booking-copy"
import { isLang } from "@/lib/cabs/lang"
import { getFirebaseWebConfig } from "@/lib/auth/firebase"
import { emulatorHost } from "@/lib/auth/firebase-phone"
import { resolveLoginHost } from "@/lib/core/login/host"
import { safeNext } from "@/lib/core/login/ticket"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { themeToCssVars } from "@/lib/theme/tokens"

export const metadata = { title: "Sign in", robots: { index: false } }
export const dynamic = "force-dynamic"

/**
 * The one place customers prove their phone number. It only ever sends them back to a business that exists, and it is dressed as
 * that business: its logo, name, colours and phone. What it proves is only a phone number: the account that results lives in that
 * one business (see the ticket callback), so signing in here never links a customer to any other business.
 */
export default async function CentralLogin({ searchParams }: { searchParams: Promise<{ host?: string; state?: string; next?: string; lang?: string }> }) {
  const q = await searchParams
  const target = await resolveLoginHost(q.host, "cabs")
  if (!target || !q.state || q.state.length < 16 || q.state.length > 64) notFound()
  const dealer = await getDealerBySlug(target.slug)
  if (!dealer) notFound()
  const lang = isLang(q.lang) ? q.lang : "en"
  const t = bookingText(lang)
  return (
    <main data-tenant={dealer.slug} style={themeToCssVars(dealer.theme) as CSSProperties} className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10" lang={lang}>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 self-center">
          <DealerMark name={dealer.displayName} logoUrl={dealer.logoUrl} className="size-14 rounded-xl text-xl" />
          <span className="text-lg font-semibold">{dealer.displayName}</span>
          {dealer.city ? <span className="-mt-1 text-sm text-muted-foreground">{dealer.city}</span> : null}
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t.loginWelcome}</CardTitle>
            <CardDescription>{t.loginSub.replace("{operator}", dealer.displayName)}</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerLoginForm config={getFirebaseWebConfig()} emulator={emulatorHost()} appCheckSiteKey={process.env.FIREBASE_APPCHECK_SITE_KEY?.trim() || null} host={target.host} state={q.state} next={safeNext(q.next)} lang={lang} operator={dealer.displayName} />
          </CardContent>
        </Card>
        <p className="px-6 text-center text-xs text-muted-foreground">
          {t.loginAgree}{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-primary">{t.loginTerms}</Link> &amp;{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-primary">{t.loginPrivacy}</Link>.
          {dealer.phone ? <><br />{t.loginHelp.replace("{phone}", dealer.phone.replace(/^\+91/, "+91 "))}</> : null}
        </p>
        {dealer.whiteLabel ? null : <PoweredBy product="cabs" className="border-t-0 py-0" />}
      </div>
    </main>
  )
}
