"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getDealerContext } from "@/lib/auth/context"
import { rateLimit } from "@/lib/core/rate-limit"
import { createLinkedAccount, getAccountStatus, requestRouteProduct } from "@/lib/route/razorpay"
import { getDealerRouteAccount, updateDealerRouteAccount } from "@/lib/tenant/route"

type Result = { ok: true } | { ok: false; error: string }

async function owner() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { ctx: null, error: "Please sign in again." }
  if (ctx.role !== "owner") return { ctx: null, error: "Only the owner can connect payouts." }
  if (!ctx.dealerInDb) return { ctx: null, error: "Not available in the local demo account." }
  return { ctx, error: null }
}

const connectSchema = z.object({
  legalName: z.string().trim().min(2, "Enter your business or legal name.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^(\+91|91|0)?[6-9][0-9]{9}$/, "Enter a valid 10-digit mobile number."))
    .transform((v) => `+91${v.slice(-10)}`),
  city: z.string().trim().min(2, "Enter your city.").max(80),
})

/**
 * Registers the dealer as a Razorpay Route linked account so buyer booking payments can transfer
 * straight to them. Bank details, PAN and terms acceptance are collected by Razorpay's own hosted
 * KYC email/dashboard flow after this, not by us.
 */
export async function connectRazorpayAccount(input: unknown): Promise<Result> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const { ctx } = who
  if (!(await rateLimit(`route-connect:${ctx.user.id}`, 5, 10 * 60_000))) return { ok: false, error: "Too many attempts. Try again in a few minutes." }

  const parsed = connectSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." }

  try {
    const created = await createLinkedAccount({ ...parsed.data, industry: ctx.dealer.industry })
    if (!created) return { ok: false, error: "Payments are not set up yet." }
    await requestRouteProduct(created.accountId)
    await updateDealerRouteAccount(ctx.dealer.id, { razorpayAccountId: created.accountId, razorpayAccountStatus: "created" })
  } catch (error) {
    console.error(`connect razorpay account failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, error: "Could not connect right now. Please try again." }
  }
  revalidatePath("/settings/payments")
  return { ok: true }
}

/** Manual fallback for account activation status, in case Route account webhooks aren't enabled. */
export async function refreshAccountStatus(): Promise<Result> {
  const who = await owner()
  if (!who.ctx) return { ok: false, error: who.error }
  const { ctx } = who

  const account = await getDealerRouteAccount(ctx.dealer.id)
  if (!account?.razorpayAccountId) return { ok: false, error: "No connected account yet." }
  try {
    const status = await getAccountStatus(account.razorpayAccountId)
    if (status) await updateDealerRouteAccount(ctx.dealer.id, { razorpayAccountStatus: status })
  } catch (error) {
    console.error(`refresh account status failed: ${error instanceof Error ? error.message : "unknown"}`)
    return { ok: false, error: "Could not refresh right now. Please try again." }
  }
  revalidatePath("/settings/payments")
  return { ok: true }
}
