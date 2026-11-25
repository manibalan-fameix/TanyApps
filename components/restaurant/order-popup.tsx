"use client"

import { useRouter } from "next/navigation"

import { Popup } from "@/components/restaurant/popup"

/** The popup an order opens in over the orders table. Closing it goes back to the table, as the browser's Back button does. */
export function OrderPopup({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const router = useRouter()
  return (
    <Popup open onOpenChange={(open) => !open && router.back()} title={title} description={description}>
      {children}
    </Popup>
  )
}
