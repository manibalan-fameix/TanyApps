"use client"

import { usePathname } from "next/navigation"
import { createContext, useContext } from "react"

const PathContext = createContext<string | null>(null)

/** Tells the store's shell which store page is being shown, when the browser's address is not a store address (the admin's preview). */
export function StorePathProvider({ path, children }: { path: string | null; children: React.ReactNode }) {
  return <PathContext.Provider value={path}>{children}</PathContext.Provider>
}

/** The store page on screen: what the header, footer and bottom bar decide by. */
export function useStorePathname(): string {
  const real = usePathname()
  return useContext(PathContext) ?? real
}
