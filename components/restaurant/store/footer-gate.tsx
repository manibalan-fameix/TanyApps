"use client"

import { createContext, useContext } from "react"
import { useStorePathname } from "@/components/restaurant/store/store-path"

const FooterContext = createContext<React.ReactNode>(null)

/** Hands the rendered footer to the About tab on the home screens (see StoreTabs). */
export function FooterProvider({ footer, children }: { footer: React.ReactNode; children: React.ReactNode }) {
  return <FooterContext.Provider value={footer}>{children}</FooterContext.Provider>
}

export function useStoreFooter() {
  return useContext(FooterContext)
}

/** The footer (catalogue links, contact) shows on the About page and inside the About tab, never on the rest of the store. */
export function FooterGate({ children }: { children: React.ReactNode }) {
  return useStorePathname() === "/about" ? children : null
}

/** Shows its children on the home screen only. Used for the fixed "Powered by" strip at the bottom of the screen. */
export function HomeOnly({ children, className }: { children: React.ReactNode; className?: string }) {
  return useStorePathname() === "/" ? <div className={className}>{children}</div> : null
}
