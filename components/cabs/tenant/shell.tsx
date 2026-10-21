import type { ReactNode } from "react"

import { DealerMark } from "@/components/dealer-mark"
import { PoweredBy } from "@/components/tenant/powered-by"
import type { DealerProfile } from "@/lib/tenant/dealer"

/** The frame of a cab operator's public site, themed with the operator's colours by the tenant layout around it. */
export function CabsShell({ dealer, children }: { dealer: DealerProfile; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <DealerMark name={dealer.displayName} logoUrl={dealer.logoUrl} />
          <span className="truncate font-semibold">{dealer.displayName}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      {dealer.whiteLabel ? null : <PoweredBy product="cabs" />}
    </div>
  )
}
