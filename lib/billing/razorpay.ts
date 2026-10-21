import { type BillingCycle, type SellablePlanKey, PLANS, TRIAL_DAYS, priceFor } from "../plans"
import { getVertical } from "../verticals"

const API = "https://api.razorpay.com/v1"

type Credentials = { keyId: string; keySecret: string }

export function razorpayCredentials(): Credentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim()
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim()
  return keyId && keySecret ? { keyId, keySecret } : null
}

async function call<T>(creds: Credentials, path: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Basic ${btoa(`${creds.keyId}:${creds.keySecret}`)}`,
      "content-type": "application/json",
    },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json().catch(() => null)) as (T & { error?: { description?: string } }) | null
  if (!res.ok || !json) throw new Error(`Razorpay ${res.status}: ${json?.error?.description ?? "request failed"}`)
  return json
}

type RazorpayPlan = { id: string; notes?: Record<string, string> }
const planIds = new Map<string, string>()

/** Finds the Razorpay plan for a plan and billing cycle, creating it on first use. Plans are keyed by notes.key. */
async function ensurePlan(creds: Credentials, industry: string, plan: SellablePlanKey, cycle: BillingCycle): Promise<string> {
  // A kind of business with its own prices gets its own plans, so its prices can never be mixed up with the shared ones. Cars and
  // restaurants keep the keys they already have.
  const key = getVertical(industry).planPrices ? `tany_${industry}_${plan}_${cycle}` : `tany_${plan}_${cycle}`
  const amount = priceFor(industry, plan, cycle) * 100
  const cached = planIds.get(`${key}:${amount}`)
  if (cached) return cached

  const list = await call<{ items: RazorpayPlan[] }>(creds, "/plans?count=100")
  const found = list.items.find((p) => p.notes?.key === key && p.notes?.amount === String(amount))
  if (found) {
    planIds.set(`${key}:${amount}`, found.id)
    return found.id
  }
  const created = await call<RazorpayPlan>(creds, "/plans", {
    method: "POST",
    body: {
      period: cycle === "yearly" ? "yearly" : "monthly",
      interval: 1,
      item: {
        name: `TanyApps ${PLANS[plan].label} (${cycle})`,
        amount,
        currency: "INR",
        description: `${PLANS[plan].label} plan, billed ${cycle}`,
      },
      notes: { key, amount: String(amount) },
    },
  })
  planIds.set(`${key}:${amount}`, created.id)
  return created.id
}

export type RazorpaySubscription = {
  id: string
  status: string
  /** Unix seconds. Null until the first charge. */
  current_end: number | null
  notes?: Record<string, string> | []
}

/**
 * Creates a subscription. Give `startAt` (unix seconds) to delay the first charge, for a trial or until an
 * existing paid period ends; leave it out to charge as soon as the payment method is authorised.
 * The owner authorises the payment method in Razorpay Checkout.
 */
export async function createSubscription(input: {
  dealerId: string
  /** The dealer's kind of business, which decides the price. */
  industry: string
  plan: SellablePlanKey
  cycle: BillingCycle
  startAt?: number
}): Promise<{ subscriptionId: string; keyId: string } | null> {
  const creds = razorpayCredentials()
  if (!creds) return null
  const planId = await ensurePlan(creds, input.industry, input.plan, input.cycle)
  const sub = await call<{ id: string }>(creds, "/subscriptions", {
    method: "POST",
    body: {
      plan_id: planId,
      total_count: input.cycle === "yearly" ? 10 : 120,
      // Razorpay rejects a start time that is too close to now, so a near-immediate start is left to it.
      ...(input.startAt && input.startAt > Math.floor(Date.now() / 1000) + 600 ? { start_at: input.startAt } : {}),
      customer_notify: 1,
      notes: { dealer_id: input.dealerId, plan: input.plan, cycle: input.cycle },
    },
  })
  return { subscriptionId: sub.id, keyId: creds.keyId }
}

/** Free trial: the first charge is after `TRIAL_DAYS`. */
export const createTrialSubscription = (input: { dealerId: string; industry: string; plan: SellablePlanKey; cycle: BillingCycle }) =>
  createSubscription({ ...input, startAt: Math.floor(Date.now() / 1000) + TRIAL_DAYS * 86_400 })

export async function getSubscription(id: string): Promise<RazorpaySubscription | null> {
  const creds = razorpayCredentials()
  if (!creds) return null
  return call<RazorpaySubscription>(creds, `/subscriptions/${encodeURIComponent(id)}`)
}

/** Stops a subscription, either now or at the end of the period already paid for. */
export async function cancelSubscription(id: string, atCycleEnd: boolean): Promise<void> {
  const creds = razorpayCredentials()
  if (!creds) return
  await call(creds, `/subscriptions/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { cancel_at_cycle_end: atCycleEnd ? 1 : 0 } })
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("")
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Webhooks are signed with HMAC-SHA256 of the raw body and the webhook secret (not the API key secret). */
export async function verifyWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  return safeEqual(await hmacHex(secret, rawBody), signature)
}

/** Checkout signs `payment_id|subscription_id` with the API key secret. */
export async function verifySubscriptionSignature(input: {
  paymentId: string
  subscriptionId: string
  signature: string
}): Promise<boolean> {
  const creds = razorpayCredentials()
  if (!creds) return false
  return safeEqual(await hmacHex(creds.keySecret, `${input.paymentId}|${input.subscriptionId}`), input.signature)
}
