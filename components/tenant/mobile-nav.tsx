"use client"

import { usePathname } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Call02Icon,
  Car01Icon,
  FilterHorizontalIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons"

import {
  MobileTab,
  MobileTabBar,
  MobileTabButton,
} from "@/components/mobile/tab-bar"

// Phone-only bottom bar for the buyer site. Car pages are left alone: they carry their own price + call bar.
export function TenantMobileNav({ phone }: { phone: string | null }) {
  const pathname = usePathname()
  if (pathname !== "/" && pathname !== "/account") return null

  // The filters live in the sidebar sheet; its trigger sits in the header.
  const openFilters = () =>
    document.querySelector<HTMLButtonElement>("[data-sidebar=trigger]")?.click()

  return (
    <MobileTabBar label="Showroom">
      <MobileTab
        href="/"
        icon={Car01Icon}
        label="Cars"
        active={pathname === "/"}
      />
      {pathname === "/" ? (
        <MobileTabButton
          icon={FilterHorizontalIcon}
          label="Filter"
          onClick={openFilters}
        />
      ) : (
        <MobileTab href="/" icon={FilterHorizontalIcon} label="Filter" />
      )}
      {phone ? (
        <li className="flex flex-1 py-1">
          <a
            href={`tel:${phone}`}
            className="flex h-full w-full touch-manipulation flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium text-muted-foreground select-none active:scale-95 active:bg-muted"
          >
            <HugeiconsIcon
              icon={Call02Icon}
              strokeWidth={2}
              className="size-6"
            />
            <span>Call</span>
          </a>
        </li>
      ) : null}
      <MobileTab
        href="/account"
        icon={UserCircleIcon}
        label="Account"
        active={pathname === "/account"}
      />
    </MobileTabBar>
  )
}
