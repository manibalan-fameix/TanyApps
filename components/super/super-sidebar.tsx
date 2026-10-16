"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"

import { superNavGroups } from "@/components/super/nav-config"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { copy } from "@/lib/copy"
import { DealerMark } from "@/components/dealer-mark"

const isActive = (pathname: string, url: string) =>
  url === "/super"
    ? pathname === url
    : pathname === url || pathname.startsWith(`${url}/`)

/** The dealer sidebar's shell and groups, pointed at the Tany team's pages. */
export function SuperSidebar({
  user,
  ...props
}: { user: { name: string; email: string } } & React.ComponentProps<
  typeof Sidebar
>) {
  const pathname = usePathname()
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/super" />}>
              <DealerMark name={copy.brand.name} logoUrl={null} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{copy.brand.name}</span>
                <span className="truncate text-xs">Super admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {superNavGroups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarMenu>
              {g.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={isActive(pathname, item.url)}
                    render={<Link href={item.url} />}
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} minimal />
      </SidebarFooter>
    </Sidebar>
  )
}
