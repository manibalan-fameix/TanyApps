import Link from "next/link"
import type { ReactNode } from "react"

import { LangToggle } from "@/components/cabs/book/lang-toggle"
import { SessionKeeper } from "@/components/cabs/book/session-keeper"
import { DealerMark } from "@/components/dealer-mark"
import { PoweredBy } from "@/components/tenant/powered-by"
import { bookingText } from "@/lib/cabs/booking-copy"
import type { Lang } from "@/lib/cabs/lang"
import type { DealerProfile } from "@/lib/tenant/dealer"

/** The frame of a cab operator's public site, themed with the operator's colours by the tenant layout around it. */
export function CabsShell({ dealer, lang, signedIn, children }: { dealer: DealerProfile; lang: Lang; signedIn: boolean; children: ReactNode }) {
  const t = bookingText(lang)
  return (
    <div className="flex min-h-svh flex-col" lang={lang}>
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
            <DealerMark name={dealer.displayName} logoUrl={dealer.logoUrl} />
            <span className="truncate font-semibold">{dealer.displayName}</span>
          </Link>
          <LangToggle lang={lang} />
          {signedIn ? (
            <>
              <Link href="/my/bookings" className="text-sm underline-offset-4 hover:underline" data-testid="nav-bookings">{t.myBookings}</Link>
              <Link href="/my" className="text-sm underline-offset-4 hover:underline">{t.myAccount}</Link>
              <SessionKeeper />
            </>
          ) : (
            <a href={`/api/t/auth/start?next=${encodeURIComponent("/my/bookings")}&lang=${lang}`} className="text-sm underline-offset-4 hover:underline">{t.signIn}</a>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      {dealer.whiteLabel ? null : <PoweredBy product="cabs" />}
    </div>
  )
}
