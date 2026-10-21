"use client"

import { createContext, useContext } from "react"

import { PRODUCTS } from "@/lib/products"
import { INDUSTRY_KEYS, type IndustryKey } from "@/lib/verticals"

/**
 * Which industries the signed-in person can actually create. Products for the others are still shown, as "coming soon", so
 * a flagged vertical (cabs) looks unreleased to everyone not on its allow-list. The server enforces the same rule when the
 * business is created; this only drives what the cards look like.
 */
const EnabledIndustries = createContext<readonly IndustryKey[]>(INDUSTRY_KEYS)

export const EnabledIndustriesProvider = EnabledIndustries.Provider
export const useEnabledIndustries = () => useContext(EnabledIndustries)

type Product = (typeof PRODUCTS)[number]

/** The industry a product card selects, or undefined when it is coming soon (or not open to this person). */
export function liveIndustry(product: Product, enabled: readonly IndustryKey[]): IndustryKey | undefined {
  return "industry" in product && enabled.includes(product.industry) ? product.industry : undefined
}
