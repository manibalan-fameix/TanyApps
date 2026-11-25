"use client"

import { usePathname } from "next/navigation"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

import { DishDetails } from "@/components/restaurant/store/dish-details"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import type { StoreCategory, StoreDish } from "@/lib/restaurant/storefront"

const Ctx = createContext<{ open: (id: string) => void } | null>(null)

/** Opens a dish in a popup (dialog on web, bottom sheet on phones) without leaving the page. */
export function useDishPopup() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useDishPopup must be used inside DishPopupProvider")
  return ctx
}

/** A dish name/photo that opens the popup. Renders a button, so it can sit anywhere a link used to. */
export function DishTrigger({ id, className, children, ...rest }: { id: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<"button">, "onClick" | "type" | "id">) {
  const { open } = useDishPopup()
  return (
    <button type="button" onClick={() => open(id)} className={className} {...rest}>
      {children}
    </button>
  )
}

export function DishPopupProvider({ dishes, categories, canOrder, children }: { dishes: StoreDish[]; categories: StoreCategory[]; canOrder: boolean; children: React.ReactNode }) {
  const [state, setState] = useState<{ id: string; path: string } | null>(null)
  const pathname = usePathname()
  const isMobile = useIsMobile()
  // Tied to the page it was opened on: a link inside the popup (the category) moves on, and the popup goes with it.
  const id = state && state.path === pathname ? state.id : null
  const dish = id ? (dishes.find((d) => d.id === id) ?? null) : null
  const category = dish ? (categories.find((c) => c.id === dish.categoryId) ?? null) : null

  const open = useCallback((next: string) => setState({ id: next, path: pathname }), [pathname])
  const value = useMemo(() => ({ open }), [open])
  const onOpenChange = (o: boolean) => {
    if (!o) setState(null)
  }
  const body = dish ? <DishDetails variant="modal" dish={dish} canOrder={canOrder} category={category} /> : null

  return (
    <Ctx.Provider value={value}>
      {children}
      {isMobile ? (
        <Sheet open={Boolean(dish)} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="max-h-[80dvh] gap-0 overflow-y-auto rounded-t-3xl *:shrink-0 p-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto mt-1 mb-9 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden />
            <SheetTitle className="sr-only">{dish?.name ?? "Dish"}</SheetTitle>
            <SheetDescription className="sr-only">Dish details</SheetDescription>
            {body}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={Boolean(dish)} onOpenChange={onOpenChange}>
          <DialogContent className="max-h-[90dvh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
            <DialogTitle className="sr-only">{dish?.name ?? "Dish"}</DialogTitle>
            <DialogDescription className="sr-only">Dish details</DialogDescription>
            {body}
          </DialogContent>
        </Dialog>
      )}
    </Ctx.Provider>
  )
}
