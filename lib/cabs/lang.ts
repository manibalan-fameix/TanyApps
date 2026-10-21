import { copy } from "../copy"
import { type CabsCopy, cabsTa } from "../copy-ta"

export const LANGS = ["en", "ta"] as const
export type Lang = (typeof LANGS)[number]

export const isLang = (v: unknown): v is Lang => v === "en" || v === "ta"

/** TanyCabs' customer text in a language. Unknown values mean English. */
export function cabsCopy(lang: string | null | undefined): CabsCopy {
  return lang === "ta" ? cabsTa : (copy.cabs as CabsCopy)
}
