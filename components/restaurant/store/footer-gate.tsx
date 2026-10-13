"use client"

import { usePathname } from "next/navigation"

/** The menu page fills the screen and scrolls inside itself, so it has no footer (same as Lala Sweets). */
export function FooterGate({ children }: { children: React.ReactNode }) {
  return usePathname() === "/menu" ? null : children
}
