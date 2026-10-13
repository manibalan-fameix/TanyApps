import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Call02Icon,
  Location01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { copy } from "@/lib/copy"
import type { DealerProfile } from "@/lib/tenant/dealer"

const t = copy.tenant

export function SiteHeader({
  dealer,
  query,
}: {
  dealer: DealerProfile
  query?: string
}) {
  // Host-based tenant resolution (proxy.ts) rewrites "/" on the dealer's subdomain/custom
  // domain to /sites/[dealer] internally — the browser-visible path is always root-relative.
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:h-16 lg:gap-6 lg:px-8">
      <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2">
        {dealer.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dealer.logoUrl}
            alt=""
            className="size-9 shrink-0 rounded-full bg-muted object-contain"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {dealer.displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="hidden truncate text-sm font-semibold tracking-tight sm:block lg:text-base">
          {dealer.displayName}
        </span>
      </Link>

      {dealer.city ? (
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium md:flex">
          <HugeiconsIcon
            icon={Location01Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          {dealer.city}
        </span>
      ) : null}

      <form
        action="/"
        method="get"
        className="w-full max-w-[8rem] min-w-0 sm:max-w-[12rem]"
      >
        <label className="flex h-9 min-w-0 items-center gap-2 rounded-full bg-muted px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search cars"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </label>
      </form>

      {dealer.phone ? (
        <a
          href={`tel:${dealer.phone}`}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-full bg-foreground px-3 py-2 text-sm font-medium text-background lg:px-4"
        >
          <HugeiconsIcon
            icon={Call02Icon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          <span className="hidden lg:inline">{t.call}</span>
        </a>
      ) : null}
    </header>
  )
}
