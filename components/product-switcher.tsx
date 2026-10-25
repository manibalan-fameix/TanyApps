"use client"

import Link from "next/link"
import { useTransition } from "react"
import { AddCircleIcon, ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { DealerMark } from "@/components/dealer-mark"
import { selectBusiness } from "@/lib/auth/actions"
import type { BusinessSummary } from "@/lib/auth/active-business"
import { productForIndustry } from "@/lib/products"
import type { IndustryKey } from "@/lib/verticals/keys"
import { cn } from "@/lib/utils"

/** A product's own logo, from /public/brand. */
function ProductIcon({ industry, className }: { industry: IndustryKey; className?: string }) {
  const { key, name } = productForIndustry(industry)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/brand/${key}-icon.svg`} alt={name} className={cn("size-8 shrink-0 rounded-lg", className)} />
  )
}

/**
 * Sidebar header: the business that is open, with a dropdown to jump to the user's other products
 * or start one they do not have yet. Switching goes through `selectBusiness`, which re-checks membership on the server.
 */
export function ProductSwitcher({
  active,
  planLabel,
  businesses,
  addable,
}: {
  active: BusinessSummary
  planLabel: string
  businesses: BusinessSummary[]
  /** Products the user has no business in yet and may start. */
  addable: IndustryKey[]
}) {
  const { isMobile } = useSidebar()
  const [pending, startTransition] = useTransition()
  const activeProduct = productForIndustry(active.industry as IndustryKey)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}>
            <DealerMark name={active.name} logoUrl={active.logoUrl} className="size-7" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{active.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {activeProduct.name}
                {planLabel ? ` · ${planLabel}` : ""}
              </span>
            </div>
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72 rounded-xl p-1.5" side={isMobile ? "bottom" : "right"} align="start" sideOffset={6}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Your products</DropdownMenuLabel>
              {businesses.map((b) => {
                const current = b.id === active.id
                return (
                  <DropdownMenuItem
                    key={b.id}
                    disabled={pending}
                    onClick={() => (current ? undefined : startTransition(() => void selectBusiness(b.id)))}
                    className={cn("gap-3 rounded-lg p-2", current && "bg-muted")}
                  >
                    {current ? <DealerMark name={b.name} logoUrl={b.logoUrl} className="size-9" /> : <ProductIcon industry={b.industry as IndustryKey} className="size-9" />}
                    <div className="grid flex-1 leading-tight">
                      <span className="truncate text-sm font-medium">{b.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{productForIndustry(b.industry as IndustryKey).name}</span>
                    </div>
                    {current ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2.5} className="size-4 text-primary" /> : null}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
            {addable.length ? (
              <>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">Add a product</DropdownMenuLabel>
                  {addable.map((industry) => (
                    <DropdownMenuItem key={industry} render={<Link href={`/onboarding?industry=${industry}`} />} className="gap-3 rounded-lg p-2">
                      <ProductIcon industry={industry} className="size-9" />
                      <div className="grid flex-1 leading-tight">
                        <span className="truncate text-sm font-medium">{productForIndustry(industry).name}</span>
                        <span className="truncate text-xs text-muted-foreground">Set up in minutes</span>
                      </div>
                      <HugeiconsIcon icon={AddCircleIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
