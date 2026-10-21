"use server"

import { verifyFirebaseIdToken } from "@/lib/auth/firebase"
import { claimVerifiedPhone, getUserPhone } from "@/lib/tenant/user-phone"
import { mapDealerSubdomain } from "@/lib/cloudflare/domains"
import { isFreePlan } from "@/lib/plans"
import { createTrialSubscription } from "@/lib/billing/razorpay"
import { getDealerContext } from "@/lib/auth/context"
import { onboardSchema, slugSchema } from "@/lib/dealers/onboard"
import { tenantUrl } from "@/lib/env"
import { getStorage } from "@/lib/storage"
import { allow } from "@/lib/rate-limit"
import { BrokenLinkError, recommendProduct } from "@/lib/ai/recommend-product"
import type { ProductKey } from "@/lib/products"
import { createDealerForOwner, isSlugTaken } from "@/lib/tenant/create-dealer"

export type SlugStatus = "available" | "taken" | "invalid" | "limited"

/** Live "is this web address free?" check. Signed-in users only, and rate limited. */
export async function checkSlug(raw: string): Promise<SlugStatus> {
  const ctx = await getDealerContext()
  if (ctx.status !== "no-dealer") return "invalid"
  if (!allow(`slug:${ctx.user.id}`, 60, 60_000)) return "limited"
  const parsed = slugSchema.safeParse(raw)
  if (!parsed.success) return "invalid"
  return (await isSlugTaken(parsed.data)) ? "taken" : "available"
}

/**
 * Records a phone number the browser just proved by OTP. The proof is a Firebase ID token, checked here:
 * the number comes from the signed token, never from the request. Returns the 10 digits.
 */
export async function verifyDealerPhone(
  idToken: string
): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const ctx = await getDealerContext()
  if (ctx.status !== "no-dealer")
    return { ok: false, error: "Please sign in again." }
  if (!allow(`verify-phone:${ctx.user.id}`, 10, 10 * 60_000))
    return {
      ok: false,
      error: "Too many attempts. Try again in a few minutes.",
    }
  const identity = await verifyFirebaseIdToken(idToken)
  if (!identity || identity.provider !== "phone" || !identity.phone)
    return {
      ok: false,
      error: "We could not verify that number. Please try again.",
    }
  if (!(await claimVerifiedPhone(ctx.user.id, identity.phone)))
    return {
      ok: false,
      error: "That number is already used by another account.",
    }
  return { ok: true, phone: identity.phone.replace(/\D/g, "").slice(-10) }
}

/** What the browser needs to open Razorpay Checkout for the trial subscription. */
export type TrialCheckout = { subscriptionId: string; keyId: string }

export type CreateResult =
  | { ok: true; url: string; checkout: TrialCheckout | null }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> }

const MAX_LOGO_BYTES = 300_000
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

/** Stores a client-resized PNG logo and returns its public URL. Anything that is not a small, real PNG is rejected. */
async function storeLogo(
  dataUrl: string,
  slug: string
): Promise<string | null> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!match) return null
  const bytes = Buffer.from(match[1], "base64")
  if (
    bytes.length > MAX_LOGO_BYTES ||
    !PNG_MAGIC.every((b, i) => bytes[i] === b)
  )
    return null
  const key = `logos/${slug}-${crypto.randomUUID()}.png`
  const storage = getStorage()
  await storage.put(key, bytes, "image/png")
  return storage.publicUrl(key)
}

export async function createDealership(
  draft: unknown,
  logoDataUrl?: string | null
): Promise<CreateResult> {
  const ctx = await getDealerContext()
  if (ctx.status !== "no-dealer")
    return { ok: false, error: "Please sign in again." }
  if (!allow(`onboard:${ctx.user.id}`, 5, 10 * 60_000))
    return {
      ok: false,
      error: "Too many attempts. Try again in a few minutes.",
    }

  const parsed = onboardSchema.safeParse(draft)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0])] ??= issue.message
    return { ok: false, fieldErrors }
  }

  // The number buyers call must be one this user proved by OTP (here or at sign-in).
  if ((await getUserPhone(ctx.user.id)) !== parsed.data.phone) {
    return {
      ok: false,
      fieldErrors: {
        phone: "Verify this mobile number with the code we send.",
      },
    }
  }

  let logoUrl: string | undefined
  if (logoDataUrl) {
    try {
      logoUrl = (await storeLogo(logoDataUrl, parsed.data.slug)) ?? undefined
    } catch {
      console.error("logo upload failed")
    }
    if (!logoUrl)
      return {
        ok: false,
        fieldErrors: {
          logo: "Could not use that logo. Try a smaller PNG or JPG.",
        },
      }
  }

  let dealerId: string
  try {
    // The dealer id is never taken from the request: the new dealer is linked to the signed-in user only.
    dealerId = await createDealerForOwner(ctx.user.id, parsed.data, logoUrl)
  } catch (error) {
    const code =
      (error as { code?: string; cause?: { code?: string } }).cause?.code ??
      (error as { code?: string }).code
    if (code === "23505")
      return {
        ok: false,
        fieldErrors: { slug: "That web address was just taken. Try another." },
      }
    console.error("create dealership failed")
    return { ok: false, error: "Something went wrong. Please try again." }
  }
  // The dealer exists at this point. A Cloudflare failure must not undo it: the mapping is an idempotent PUT and can be re-run.
  const mapped = await mapDealerSubdomain(parsed.data.slug)
  if (!mapped.ok && !mapped.skipped)
    console.error(
      `subdomain mapping failed for ${parsed.data.slug}: ${mapped.reason}`
    )

  // Billing never blocks the showroom: the trial is already recorded on the dealer. If Razorpay is
  // unavailable the owner can add a payment method later.
  let checkout: TrialCheckout | null = null
  try {
    // The free plan never asks for a payment method.
    const plan = parsed.data.plan
    if (!isFreePlan(plan))
      checkout = await createTrialSubscription({
        dealerId,
        plan,
        cycle: parsed.data.billingCycle,
      })
  } catch (error) {
    console.error(
      `subscription setup failed for ${parsed.data.slug}: ${error instanceof Error ? error.message : "unknown"}`
    )
  }
  return { ok: true, url: tenantUrl(parsed.data.slug), checkout }
}

/** "Find my Tany": maps a one-line business description to a product. Signed-in users only, rate limited. */
export async function findMyProduct(
  description: string
): Promise<
  | { ok: true; product: ProductKey; reason: string }
  | { ok: false; error: string }
> {
  const ctx = await getDealerContext()
  if (ctx.status !== "no-dealer") return { ok: false, error: "Please sign in again." }
  const text = description.trim().slice(0, 300)
  if (text.length < 3) return { ok: false, error: "Tell us a little about your business." }
  if (!allow(`recommend:${ctx.user.id}`, 15, 10 * 60_000))
    return { ok: false, error: "Too many tries. Please wait a few minutes." }
  let rec
  try {
    rec = await recommendProduct(text)
  } catch (e) {
    if (e instanceof BrokenLinkError)
      return { ok: false, error: "We couldn't open that link. Check it, or describe your business in a sentence." }
    throw e
  }
  if (!rec) return { ok: false, error: "We could not match that. Try describing what you sell or do." }
  return { ok: true, ...rec }
}
