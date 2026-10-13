// "You save" comparison against a new car of the same model. Pure and client-safe.
import { calculateEmi } from "./emi.ts"

/** Same defaults the buyer EMI calculator starts from, so the two numbers agree. */
export const SAVINGS_EMI_ASSUMPTIONS = { downPaymentPct: 20, annualRate: 10.99, months: 60 } as const

export type NewCarSavings = {
  newCarPrice: number
  askingPrice: number
  saving: number
  savingPct: number
  newEmi: number
  usedEmi: number
  emiSaving: number
}

/** Null unless both prices are known and the used car is actually cheaper: never show a "saving" that isn't one. */
export function computeNewCarSavings(input: { askingPrice: number | null; newCarPrice: number | null | undefined }): NewCarSavings | null {
  const { askingPrice, newCarPrice } = input
  if (!askingPrice || !newCarPrice || newCarPrice <= askingPrice) return null
  const { downPaymentPct, annualRate, months } = SAVINGS_EMI_ASSUMPTIONS
  const emiFor = (price: number) => Math.round(calculateEmi(price * (1 - downPaymentPct / 100), annualRate, months))
  const newEmi = emiFor(newCarPrice)
  const usedEmi = emiFor(askingPrice)
  return {
    newCarPrice,
    askingPrice,
    saving: newCarPrice - askingPrice,
    savingPct: Math.round(((newCarPrice - askingPrice) / newCarPrice) * 100),
    newEmi,
    usedEmi,
    emiSaving: newEmi - usedEmi,
  }
}
