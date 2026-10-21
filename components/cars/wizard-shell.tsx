"use client"

import Link from "next/link"
import { createContext, useContext, useState } from "react"
import { createPortal } from "react-dom"

import { DealerMark } from "@/components/dealer-mark"
import { Button, buttonVariants } from "@/components/ui/button"
import { copy } from "@/lib/copy"
import { cn } from "@/lib/utils"

const FooterSlot = createContext<HTMLElement | null>(null)

/** Renders its children in the shell's bottom-right slot, so each step keeps its own submit logic. */
export function FooterAction({ children }: { children: React.ReactNode }) {
  const slot = useContext(FooterSlot)
  return slot ? createPortal(children, slot) : null
}

const BarSlot = createContext<HTMLElement | null>(null)

/** Renders its children in a full-width strip between the scrolling page and the footer, so it never covers the content. */
export function BarAction({ children }: { children: React.ReactNode }) {
  const slot = useContext(BarSlot)
  return slot ? createPortal(children, slot) : null
}

/**
 * Full-screen focused layout: brand and Exit on top, a big heading, one centred column,
 * then segmented progress with Back on the left and the step's primary action on the right.
 */
export function WizardShell({
  dealer,
  title,
  subtitle,
  segments,
  active,
  onBack,
  wide,
  hideHeading,
  noFooter,
  headerTitle,
  children,
}: {
  dealer: { name: string; logoUrl: string | null }
  title: string
  subtitle?: string
  segments?: number
  active?: number
  onBack?: () => void
  /** Wider content column, for two-column screens. */
  wide?: boolean
  /** Hide the big heading visually (kept for screen readers) when the content carries its own. */
  hideHeading?: boolean
  /** No bottom row (Back and the step's action), for screens that carry their own controls. */
  noFooter?: boolean
  /** A title centred in the top bar. */
  headerTitle?: string
  children: React.ReactNode
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [bar, setBar] = useState<HTMLElement | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-[calc(0.75rem+var(--safe-area-inset-top))] pb-3 sm:px-14 sm:py-5">
        <div className="flex shrink-0 items-center gap-3 sm:flex-1">
          <DealerMark
            name={dealer.name}
            logoUrl={dealer.logoUrl}
            className="size-10"
          />
          <span className="hidden text-base font-semibold tracking-tight sm:block">
            {dealer.name}
          </span>
        </div>
        {headerTitle ? (
          <h2
            className="min-w-0 flex-1 truncate text-center text-base font-semibold tracking-tight sm:text-lg"
            data-testid="wizard-header-title"
          >
            {headerTitle}
          </h2>
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex shrink-0 justify-end sm:flex-1">
          <Link
            href="/cars"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {copy.admin.addCar.exit}
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-8 pt-4 pb-8",
            wide ? "max-w-[1120px]" : "max-w-[830px]"
          )}
        >
          <div className={cn("flex flex-col gap-3", hideHeading && "sr-only")}>
            <h1
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
              data-testid="wizard-title"
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-lg text-muted-foreground sm:text-xl">
                {subtitle}
              </p>
            )}
          </div>
          <FooterSlot.Provider value={slot}>
            <BarSlot.Provider value={bar}>{children}</BarSlot.Provider>
          </FooterSlot.Provider>
        </div>
      </main>

      <div ref={setBar} className="shrink-0 empty:hidden" />

      {!noFooter && (
        <footer className="flex shrink-0 flex-col gap-4 px-6 pb-6 sm:px-14">
          {segments ? (
            <div
              className="flex gap-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={segments}
              aria-valuenow={active ?? 0}
              aria-label="Progress"
            >
              {Array.from({ length: segments }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    i < (active ?? 0) ? "bg-primary" : "bg-muted"
                  )}
                />
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            {onBack ? (
              <Button variant="ghost" size="lg" onClick={onBack}>
                {copy.admin.addCar.back}
              </Button>
            ) : (
              <span />
            )}
            <div ref={setSlot} className="flex items-center gap-2" />
          </div>
        </footer>
      )}
    </div>
  )
}
