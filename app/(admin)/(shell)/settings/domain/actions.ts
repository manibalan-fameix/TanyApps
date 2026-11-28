"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getDealerContext } from "@/lib/auth/context"
import { customDomainsConfigured } from "@/lib/cloudflare/custom-hostnames"
import { rateLimit } from "@/lib/core/rate-limit"
import { parseCustomHostname } from "@/lib/domains/hostname"
import { offersCustomDomain } from "@/lib/domains/rollout"
import { getRootDomain } from "@/lib/env"
import { getPlan } from "@/lib/plans"
import { effectivePlanKey } from "@/lib/billing/state"
import { type Business, type DomainResult, addDomain, checkDomain, makePrimary, removeDomain, useDefaultAddress } from "@/lib/tenant/domains"

const fail = (error: string): DomainResult => ({ ok: false, error })

/**
 * The signed-in owner of a real business, rate limited. `needsPlan` is false only for steps that undo things, so a business that
 * has left the plan can still disconnect its domain.
 */
async function requireOwner(needsPlan: boolean, limit: "domain" | "domain-auto" = "domain"): Promise<{ business: Business; userId: string } | { error: string }> {
  const ctx = await getDealerContext()
  if (ctx.status !== "ok") return { error: "Please sign in again." }
  if (ctx.role !== "owner") return { error: "Only the owner can change the web address." }
  if (!ctx.dealerInDb) return { error: "Not available in the local demo account." }
  if (needsPlan) {
    if (!offersCustomDomain(ctx.dealer.industry)) return { error: "Custom domains are not available for this product yet." }
    if (!getPlan(effectivePlanKey(ctx.dealer)).customDomain) return { error: "Your own domain is part of the Pro plan." }
    if (!customDomainsConfigured()) return { error: "Custom domains are not switched on yet." }
  }
  // Each check calls DNS and Cloudflare.
  if (!(await rateLimit(`${limit}:${ctx.dealer.id}`, limit === "domain" ? 20 : 40, 10 * 60_000, { failClosed: true }))) return { error: "Too many attempts. Try again in a few minutes." }
  return { business: { id: ctx.dealer.id, slug: ctx.dealer.slug }, userId: ctx.user.id }
}

type Owner = Awaited<ReturnType<typeof requireOwner>>

async function run(who: Owner, step: (business: Business, userId: string) => Promise<DomainResult>): Promise<DomainResult> {
  if ("error" in who) return fail(who.error)
  const result = await step(who.business, who.userId)
  // The whole shell: the "view site" links follow the main address.
  revalidatePath("/", "layout")
  return result
}

export async function addCustomDomain(input: unknown): Promise<DomainResult> {
  const text = z.string().max(300).safeParse(input)
  const parsed = parseCustomHostname(text.success ? text.data : "", getRootDomain())
  if (!parsed.ok) return fail(parsed.error)
  return run(await requireOwner(true), (business, userId) => addDomain(business, parsed.hostname, userId))
}

export async function checkCustomDomain(): Promise<DomainResult> {
  return run(await requireOwner(true), (business) => checkDomain(business))
}

/** Asked by the open settings page every half minute, so the owner never has to press anything while they wait. */
export async function autoCheckCustomDomain(): Promise<DomainResult> {
  // Its own limit, so waiting on the page cannot use up the owner's own attempts.
  const who = await requireOwner(true, "domain-auto")
  return "error" in who ? fail(who.error) : checkDomain(who.business)
}

export async function makeCustomDomainPrimary(): Promise<DomainResult> {
  return run(await requireOwner(true), (business, userId) => makePrimary(business, userId))
}

export async function switchToDefaultAddress(): Promise<DomainResult> {
  return run(await requireOwner(false), (business, userId) => useDefaultAddress(business, userId))
}

export async function removeCustomDomain(): Promise<DomainResult> {
  return run(await requireOwner(false), (business, userId) => removeDomain(business, userId))
}
