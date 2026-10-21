"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  HelpCircleIcon,
  Home01Icon,
  LinkSquare02Icon,
  Logout01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"

import {
  ADMIN_NAV,
  type NavMainItem,
  navSecondary,
  userMenuPages,
} from "@/components/admin/nav-config"
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
import { DEFAULT_INDUSTRY, type IndustryKey } from "@/lib/verticals"

const n = copy.admin.nav
const isActive = (pathname: string, url: string) =>
  pathname === url || pathname.startsWith(`${url}/`)

// Destinations that live under "More" on a phone: everything the tab bar has no room for.
const moreFor = (items: NavMainItem[], tabUrls: string[]) => [
  ...items.filter((i) => !tabUrls.includes(i.url)).map((i) => ({ title: i.title, url: i.url, icon: i.icon })),
  { title: n.help, url: navSecondary.help.url, icon: HelpCircleIcon },
]
const moreLinksFor = (industry: IndustryKey) => {
  const spec = ADMIN_NAV[industry]
  return moreFor(spec.items, spec.tabUrls)
}

export function AdminMobileNav({ publicUrl, industry }: { publicUrl: string; industry?: IndustryKey }) {
  const spec = ADMIN_NAV[industry ?? DEFAULT_INDUSTRY]
  const moreLinks = moreLinksFor(industry ?? DEFAULT_INDUSTRY)
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)

  const moreActive =
    moreLinks.some((l) => isActive(pathname, l.url)) ||
    userMenuPages.some((p) => isActive(pathname, p.url))

  return (
    <>
      <MobileTabBar label="Main">
        <MobileTab
          href="/dashboard"
          icon={Home01Icon}
          label={n.dashboard}
          active={isActive(pathname, "/dashboard")}
        />
        <MobileTab
          href={spec.catalogueTab.href}
          icon={spec.catalogueTab.icon}
          label={spec.catalogueTab.label}
          active={spec.catalogueTab.isActive(pathname)}
        />
        <MobileTab
          href={spec.addItem.href}
          icon={Add01Icon}
          label={spec.addItem.label}
          prominent
        />
        <MobileTab
          href={spec.inboxTab.href}
          icon={spec.inboxTab.icon}
          label={spec.inboxTab.label}
          active={spec.inboxTab.isActive(pathname)}
        />
        <MobileTabButton
          icon={MoreHorizontalIcon}
          label={n.more}
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
            <SheetTitle>{n.more}</SheetTitle>
          </SheetHeader>
          <div
            className="flex flex-col gap-1 overflow-y-auto px-2 pb-4"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false)
            }}
          >
            {moreLinks.map((l) => (
              <SheetLink
                key={l.url}
                href={l.url}
                icon={l.icon}
                title={l.title}
              />
            ))}
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className={rowClass}
            >
              <HugeiconsIcon
                icon={LinkSquare02Icon}
                strokeWidth={2}
                className="size-5"
              />
              {navSecondary.viewPage.title}
            </a>
            <div className="my-1 h-px bg-border" />
            {userMenuPages.map((p) => (
              <Link key={p.url} href={p.url} className={rowClass}>
                {p.title}
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

const rowClass =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-muted"

function SheetLink({
  href,
  icon,
  title,
}: {
  href: string
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  title: string
}) {
  return (
    <Link href={href} className={rowClass}>
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
      {title}
    </Link>
  )
}
