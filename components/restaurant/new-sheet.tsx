"use client"

import { useState } from "react"

import { BannerForm, CouponForm } from "@/components/restaurant/simple-forms"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const COPY = {
  coupon: { button: "New coupon", title: "New coupon", body: "Guests enter the code at checkout." },
  banner: { button: "New banner", title: "New banner", body: "Shown at the top of your menu page." },
}

/** The "add" action for small lists: opens a side panel, like the edit panel on the cars list. */
export function NewSheet({ kind }: { kind: keyof typeof COPY }) {
  const [open, setOpen] = useState(false)
  const c = COPY[kind]
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button />}>{c.button}</SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{c.title}</SheetTitle>
          <SheetDescription>{c.body}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{kind === "coupon" ? <CouponForm onDone={() => setOpen(false)} /> : <BannerForm onDone={() => setOpen(false)} />}</div>
      </SheetContent>
    </Sheet>
  )
}
