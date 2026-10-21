import { cookies } from "next/headers"

import { type Lang, isLang } from "./lang"

export const LANG_COOKIE = "tany_lang"

/** The language this visitor chose (English unless they picked Tamil). */
export async function currentLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value
  return isLang(v) ? v : "en"
}
