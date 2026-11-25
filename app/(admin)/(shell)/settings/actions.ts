"use server"

import { revalidatePath } from "next/cache"

import { getDealerContext } from "@/lib/auth/context"
import { verifyFirebaseIdToken } from "@/lib/auth/firebase"
import { rateLimit } from "@/lib/core/rate-limit"
import { storeLogo } from "@/lib/dealers/logo"
import { businessDetailsSchema, hoursSchema, mobileSchema } from "@/lib/dealers/onboard"
import { setDealerDetails, setDealerHours, setDealerTheme } from "@/lib/tenant/settings"
import { claimVerifiedPhone, getUserPhone } from "@/lib/tenant/user-phone"
import { validateTheme } from "@/lib/theme/tokens"

export type SaveResult = { ok: true; note?: string } | { ok: false; error: string }

/** Settings are owner-only, and never written for the in-memory demo dealer. */
async function ownerDealerId(): Promise<{ id: string } | { error: string }> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { error: "Please sign in again." }
  if (ctx.role !== "owner") return { error: "Only the owner can change settings." }
  if (!ctx.dealerInDb) return { error: "Settings are not available in the local demo account." }
  return { id: ctx.dealer.id }
}

export async function saveHours(input: unknown): Promise<SaveResult> {
  const who = await ownerDealerId()
  if ("error" in who) return { ok: false, error: who.error }
  const parsed = hoursSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your hours." }
  await setDealerHours(who.id, parsed.data)
  revalidatePath("/settings/hours")
  return { ok: true }
}

export async function saveTheme(input: unknown): Promise<SaveResult> {
  const who = await ownerDealerId()
  if ("error" in who) return { ok: false, error: who.error }
  const result = validateTheme(input)
  if (!result.ok) return { ok: false, error: result.errors[0] ?? "Check your colours." }
  await setDealerTheme(who.id, result.theme)
  revalidatePath("/settings/theme")
  revalidatePath("/", "layout")
  return { ok: true, note: result.adjustments[0] }
}

/** The signed-in owner, with the business being edited. */
async function requireOwner() {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { error: "Please sign in again." }
  if (ctx.role !== "owner") return { error: "Only the owner can change settings." }
  if (!ctx.dealerInDb) return { error: "Settings are not available in the local demo account." }
  return { userId: ctx.user.id, dealer: ctx.dealer }
}

/** Records a new business number the owner just proved by OTP. The number comes from the signed token, never from the request. */
export async function verifyBusinessPhone(idToken: string): Promise<{ ok: true; phone: string; notice?: string } | { ok: false; error: string }> {
  const who = await requireOwner()
  if ("error" in who) return { ok: false, error: who.error! }
  if (!(await rateLimit(`verify-phone:${who.userId}`, 10, 10 * 60_000, { failClosed: true })))
    return { ok: false, error: "Too many attempts. Try again in a few minutes." }
  const identity = await verifyFirebaseIdToken(idToken)
  if (!identity || identity.provider !== "phone" || !identity.phone) return { ok: false, error: "We could not verify that number. Please try again." }
  const claim = await claimVerifiedPhone(who.userId, identity.phone, who.dealer.industry)
  if (!claim.ok) return { ok: false, error: "That number is already used by another account." }
  return { ok: true, phone: identity.phone.replace(/\D/g, "").slice(-10) }
}

const lastTen = (v: string | null) => (v ?? "").replace(/\D/g, "").slice(-10)

export async function saveBusinessDetails(input: unknown): Promise<{ ok: true; logoUrl: string | null } | { ok: false; error: string }> {
  const who = await requireOwner()
  if ("error" in who) return { ok: false, error: who.error! }
  const { dealer, userId } = who
  if (!(await rateLimit(`business-details:${dealer.id}`, 20, 10 * 60_000))) return { ok: false, error: "Too many changes. Try again in a few minutes." }
  const parsed = businessDetailsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { displayName, city, phone, businessType, logo } = parsed.data

  // A changed number must be one this owner proved by OTP, as at onboarding: it is the number customers call.
  let newPhone: string | undefined
  if (lastTen(phone) !== lastTen(dealer.phone)) {
    const checked = mobileSchema.safeParse(phone)
    if (!checked.success) return { ok: false, error: checked.error.issues[0].message }
    if ((await getUserPhone(userId, dealer.industry)) !== checked.data) return { ok: false, error: "Verify this mobile number with the code we send." }
    newPhone = checked.data
  }

  // Left out keeps the logo, null removes it.
  let logoUrl: string | null | undefined = logo === null ? null : undefined
  if (logo) {
    try {
      logoUrl = await storeLogo(logo, dealer.slug)
    } catch {
      console.error("logo upload failed")
      logoUrl = null
    }
    if (!logoUrl) return { ok: false, error: "Could not use that logo. Try a smaller PNG or JPG." }
  }

  await setDealerDetails(dealer.id, {
    displayName,
    city,
    ...(newPhone ? { phone: newPhone } : {}),
    // Only retail has a shop type.
    ...(dealer.industry === "retail" && businessType ? { businessType } : {}),
    ...(logoUrl !== undefined ? { logoUrl } : {}),
  })
  // The name and logo appear across the admin and every public page.
  revalidatePath("/", "layout")
  return { ok: true, logoUrl: logoUrl === undefined ? dealer.logoUrl : logoUrl }
}
