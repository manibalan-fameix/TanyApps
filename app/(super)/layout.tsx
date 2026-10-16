import { SuperSearchBox } from "@/components/super/search-box"
import { SuperBreadcrumb } from "@/components/super/super-breadcrumb"
import { SuperMobileNav } from "@/components/super/super-mobile-nav"
import { SuperSidebar } from "@/components/super/super-sidebar"
import { PullToRefresh } from "@/components/pull-to-refresh"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { requireSuperAdmin } from "@/lib/super/guard"

export const metadata = {
  title: { default: "Super admin", template: "%s · Super admin" },
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

// The Tany team's own area. Same shell as the dealer admin, but every page is gated on the team list.
export default async function SuperLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { email } = await requireSuperAdmin()
  return (
    <ThemeProvider>
      <TooltipProvider>
        <SidebarProvider>
          <SuperSidebar user={{ name: "Tany team", email }} />
          <SidebarInset>
            <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur max-md:border-b max-md:border-border md:static md:h-16 md:bg-transparent md:pt-0 md:backdrop-blur-none">
              <div className="flex items-center gap-2 px-4 md:px-10">
                <SidebarTrigger className="-ml-1 max-md:hidden" />
                <Separator
                  orientation="vertical"
                  className="mr-2 max-md:hidden data-vertical:h-4 data-vertical:self-auto"
                />
                <SuperBreadcrumb />
              </div>
              <div className="ml-auto flex items-center gap-2 px-4 md:px-10">
                <SuperSearchBox className="hidden w-72 md:block" />
                <ThemeToggle />
              </div>
            </header>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-10 md:pt-0 md:pb-8">
              {children}
            </div>
          </SidebarInset>
          <PullToRefresh />
          <SuperMobileNav />
        </SidebarProvider>
      </TooltipProvider>
      <Toaster />
    </ThemeProvider>
  )
}
