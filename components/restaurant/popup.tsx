"use client"

import { createContext, useContext, useState } from "react"
import { createPortal } from "react-dom"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * The three pop-up widths used in the admin. Every catalogue pop-up (add, edit, categories, import) uses the same one, `md`, so they
 * open at the same size. `sm` is for short confirmations and `lg` for wide data screens.
 */
export const POPUP_SIZE = {
  sm: "sm:max-w-md",
  md: "sm:max-w-3xl",
  lg: "sm:max-w-6xl",
} as const

const FooterSlot = createContext<HTMLElement | null>(null)
const ToolbarSlot = createContext<HTMLElement | null>(null)

/**
 * A centred pop-up in three parts. The title stays at the top, the action buttons (wrapped in `PopupFooter`) stay at the bottom, and only
 * the middle scrolls, with a slim bar that shows while scrolling or hovering. The card itself never scrolls.
 */
export function Popup({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  covered = false,
  keepOpenOnOutsideClick = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  size?: keyof typeof POPUP_SIZE
  /** Hide the pop-up (keeping its state) while a slider or confirmation is open on top of it. */
  covered?: boolean
  /** For pop-ups that must not vanish on a stray click; the close button and Escape still work. */
  keepOpenOnOutsideClick?: boolean
  children: React.ReactNode
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal={keepOpenOnOutsideClick}>
      <DialogContent className={cn("flex max-h-[90svh] flex-col gap-4 overflow-hidden transition-opacity duration-150", POPUP_SIZE[size], covered && "invisible opacity-0")}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div ref={setToolbar} className="shrink-0 empty:hidden" />
        <ToolbarSlot.Provider value={toolbar}>
        <FooterSlot.Provider value={slot}>
          {/* Wait for the fixed slots, so toolbars and buttons never flash inside the scrolling part. */}
          {slot && toolbar ? (
            <ScrollArea className="-mr-4 max-h-[calc(90svh-12rem)] min-h-0">
              <div className="pr-4">{children}</div>
            </ScrollArea>
          ) : (
            <div />
          )}
        </FooterSlot.Provider>
        </ToolbarSlot.Provider>
        <div ref={setSlot} className="shrink-0 empty:hidden [&:not(:empty)]:border-t [&:not(:empty)]:pt-4" />
      </DialogContent>
    </Dialog>
  )
}

/** A search or add bar that stays fixed under the title while the list below it scrolls. Outside a pop-up it renders in place. */
export function PopupToolbar({ children }: { children: React.ReactNode }) {
  const slot = useContext(ToolbarSlot)
  return slot ? createPortal(children, slot) : <>{children}</>
}

/** Action buttons that belong at the bottom of a pop-up. Outside a pop-up (the same screen as a page) they simply render in place. */
export function PopupFooter({ children }: { children: React.ReactNode }) {
  const slot = useContext(FooterSlot)
  return slot ? createPortal(children, slot) : <>{children}</>
}
