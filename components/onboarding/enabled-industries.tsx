"use client"

import { createContext, useContext } from "react"

import { PRODUCTS } from "@/lib/products"
import { INDUSTRY_KEYS, type IndustryKey } from "@/lib/verticals"

/** Which industries the signed-in person can actually create. The server enforces the same rule when creating the business. */
const EnabledIndustries = createContext<readonly IndustryKey[]>(INDUSTRY_KEYS)

export const EnabledIndustriesProvider = EnabledIndustries.Provider
export const useEnabledIndustries = () => useContext(EnabledIndustries)

type Product = (typeof PRODUCTS)[number]

/** The industry a product card selects, or undefined when it is not available. */
export function liveIndustry(product: Product, enabled: readonly IndustryKey[]): IndustryKey | undefined {
  return "industry" in product && enabled.includes(product.industry) ? product.industry : undefined
}
