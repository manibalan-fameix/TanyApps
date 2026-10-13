import { redirect } from "next/navigation"

import { getDealerContext } from "../auth/context"

/** For restaurant admin pages: sends everyone else (signed out, no business, or another industry) away. */
export async function requireRestaurant() {
  const ctx = await getDealerContext()
  if (ctx.status === "anonymous") redirect("/login")
  if (ctx.status === "no-dealer") redirect("/onboarding")
  if (ctx.dealer.industry !== "restaurants" || !ctx.dealerInDb) redirect("/dashboard")
  return { dealer: ctx.dealer, owner: ctx.role === "owner" }
}
