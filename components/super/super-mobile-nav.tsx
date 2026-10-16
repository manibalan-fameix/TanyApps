"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Logout01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons"

import { superNav } from "@/components/super/nav-config"
import {
  MobileTab,
  MobileTabBar,
  MobileTabButton,
} from "@/components/mobile/tab-bar"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { signOutAction } from "@/lib/auth/actions"
import { copy } from "@/lib/copy"

const isActive = (pathname: string, url: string) =>
  url === "/super"
    ? pathname === url
    : pathname === url || pathname.startsWith(`${url}/`)
const TABS = [
  "/super",
  "/super/businesses",
  "/super/analytics",
  "/super/revenue",
]
const rowClass =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-muted"

export function SuperMobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const tabs = superNav.filter((i) => TABS.includes(i.url))
  const more = superNav.filter((i) => !TABS.includes(i.url))
  const moreActive = more.some((i) => isActive(pathname, i.url))
  return (
    <>
      <MobileTabBar label="Main">
        {tabs.map((t) => (
          <MobileTab
            key={t.url}
            href={t.url}
            icon={t.icon}
            label={t.title.split(" ")[0]!}
            active={isActive(pathname, t.url)}
          />
        ))}
        <MobileTabButton
          icon={MoreHorizontalIcon}
          label={copy.admin.nav.more}
          active={moreActive || open}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        />
      </MobileTabBar>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85svh] gap-0 rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle>{copy.admin.nav.more}</SheetTitle>
          </SheetHeader>
          <div
            className="flex flex-col gap-1 overflow-y-auto px-2 pb-4"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false)
            }}
          >
            {more.map((l) => (
              <Link key={l.url} href={l.url} className={rowClass}>
                <HugeiconsIcon
                  icon={l.icon}
                  strokeWidth={2}
                  className="size-5"
                />
                {l.title}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-sm text-muted-foreground">
                {copy.admin.nav.theme}
              </span>
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={() => void signOutAction()}
              className={rowClass}
            >
              <HugeiconsIcon
                icon={Logout01Icon}
                strokeWidth={2}
                className="size-5"
              />
              {copy.auth.signOut}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
