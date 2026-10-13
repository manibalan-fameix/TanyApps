"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FavouriteIcon,
  Location01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { AccountMenu } from "@/components/tenant/account-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function DealerInventoryHeader({
  dealer,
  query,
}: {
  dealer: { name: string; city: string | null; logoUrl: string | null }
  query: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value =
      new FormData(event.currentTarget).get("q")?.toString().trim() ?? ""
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set("q", value)
    else params.delete("q")
    router.push(
      `${pathname}${params.toString() ? `?${params.toString()}` : ""}`,
      { scroll: false }
    )
  }

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur lg:h-16 lg:px-8">
      <div className="flex items-center gap-3 md:hidden">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
      </div>
      <Link href="/" className="flex h-12 shrink-0 items-center gap-2 lg:h-14">
        {dealer.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dealer.logoUrl}
            alt={dealer.name}
            className="size-10 rounded-full bg-muted object-contain lg:size-11"
          />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground lg:size-11">
            {dealer.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-40 truncate text-sm font-semibold tracking-tight sm:block lg:text-base">
          {dealer.name}
        </span>
      </Link>
      <form
        onSubmit={submitSearch}
        className="max-w-[13.25rem] min-w-0 flex-1 sm:max-w-[15.25rem]"
      >
        <label className="flex h-9 items-center gap-2 rounded-xl border border-border bg-muted px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="size-4 shrink-0"
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search make or model"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </label>
      </form>
      {dealer.city && (
        <span className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex">
          <HugeiconsIcon
            icon={Location01Icon}
            strokeWidth={2}
            className="size-4"
          />
          {dealer.city}
        </span>
      )}
      <nav className="ml-auto flex items-center gap-1">
        <Link
          href="/shortlisted"
          className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <HugeiconsIcon
            icon={FavouriteIcon}
            strokeWidth={2}
            className="size-5 shrink-0"
          />
          <span className="hidden md:inline">Shortlisted</span>
        </Link>
        <AccountMenu />
      </nav>
    </header>
  )
}
