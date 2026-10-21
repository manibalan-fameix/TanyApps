import { notFound, redirect } from "next/navigation"

import { currentCustomer } from "@/lib/core/login/customer"
import { scopedDb } from "@/lib/db/scoped"
import { getDealerBySlug } from "@/lib/tenant/dealer"
import { currentLang } from "./lang-server"

/** For the signed-in pages of a cab operator's site: the business, the customer and their language. Signed-out visitors go to the login and come back. */
export async function customerPage(params: Promise<{ dealer: string }>, nextPath: string) {
  const dealer = await getDealerBySlug((await params).dealer)
  if (!dealer || dealer.industry !== "cabs") notFound()
  const lang = await currentLang()
  const customer = await currentCustomer(dealer.id)
  if (!customer) redirect(`/api/t/auth/start?next=${encodeURIComponent(nextPath)}&lang=${lang}`)
  return { dealer, db: scopedDb(dealer.id), lang, customer }
}

/** "5 Nov 2026, 10:00 am" in India time, in the visitor's language. */
export const fmtIst = (iso: string, lang: "en" | "ta") => new Date(iso).toLocaleString(lang === "ta" ? "ta-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
