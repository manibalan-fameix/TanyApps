"use client"

import Link from "next/link"
import * as React from "react"
import { AddCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { navMain, navRestaurantGroups } from "@/components/admin/nav-config"
import type { IndustryKey } from "@/lib/industries"
import { NavMain } from "@/components/nav-main"
import { NavProjects, type RecentCar } from "@/components/nav-projects"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { copy } from "@/lib/copy"
import { DealerMark } from "@/components/dealer-mark"

// shadcn "sidebar-08" block, populated with the signed-in dealer's data.
export function AppSidebar({
  dealerName,
  dealerLogoUrl,
  planLabel,
  publicUrl,
  user,
  recentCars,
  industry,
  ...props
}: {
  dealerName: string
  dealerLogoUrl: string | null
  planLabel: string
  publicUrl: string
  user: { name: string; email: string }
  recentCars: RecentCar[]
  industry?: IndustryKey
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <DealerMark name={dealerName} logoUrl={dealerLogoUrl} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{dealerName}</span>
                <span className="truncate text-xs">{planLabel}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <div className="px-2 pt-1">
          <Link
            href={industry === "restaurants" ? "/menu/new" : "/cars/new"}
            title={industry === "restaurants" ? "Add dish" : copy.admin.nav.addCar}
            className="group/add relative flex h-10 items-center justify-center gap-2 overflow-hidden rounded-lg bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary),white_28%),color-mix(in_oklab,var(--primary),black_28%))] text-sm font-semibold text-primary-foreground shadow-md shadow-primary/30 transition-all group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0 hover:shadow-lg hover:shadow-primary/40 active:scale-[0.98]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 to-transparent"
            />
            <HugeiconsIcon
              icon={AddCircleIcon}
              strokeWidth={2}
              className="relative size-5 shrink-0 transition-transform group-hover/add:rotate-90"
            />
            <span className="relative truncate group-data-[collapsible=icon]:hidden">
              {industry === "restaurants" ? "Add dish" : copy.admin.nav.addCar}
            </span>
          </Link>
        </div>
        {industry === "restaurants" ? (
          navRestaurantGroups.map((g) => <NavMain key={g.label} label={g.label} items={g.items} />)
        ) : (
          <NavMain items={navMain} />
        )}
        {industry === "restaurants" ? null : <NavProjects cars={recentCars} />}
        <NavSecondary publicUrl={publicUrl} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
