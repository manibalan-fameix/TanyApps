"use client"

import { createContext, useContext } from "react"

import { type StoreTerms, storeTerms } from "@/lib/verticals/terms"

const Ctx = createContext<StoreTerms>(storeTerms("restaurants"))

/** Gives every public store component the words for this business (dish or product, menu or catalogue). */
export function StoreTermsProvider({ value, children }: { value: StoreTerms; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useStoreTerms = () => useContext(Ctx)
