import { razorpayCredentials } from "../billing/razorpay"
import { getVertical } from "../verticals"

const API = "https://api.razorpay.com"

type Credentials = { keyId: string; keySecret: string }

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

export type LinkedAccountInput = {
  legalName: string
  email: string
  phone: string
  city: string
  /** Sets the business category Razorpay files the account under. Defaults to a vehicle dealer. */
  industry?: string
}

type LinkedAccount = { id: string; status?: string }

/**
 * Creates a Route linked account for a dealer. This only registers the dealer's identity with
 * Razorpay; bank details, PAN and TnC acceptance are collected by Razorpay's own hosted KYC flow
 * once `requestRouteProduct` is called, not by us.
 */
export async function createLinkedAccount(input: LinkedAccountInput): Promise<{ accountId: string } | null> {
  const creds = razorpayCredentials()
  if (!creds) return null
  const account = await call<LinkedAccount>(creds, "/v2/accounts", {
    method: "POST",
    body: {
      email: input.email,
      phone: input.phone,
      type: "route",
      legal_business_name: input.legalName,
      business_type: "individual",
      contact_name: input.legalName,
      profile: {
        ...getVertical(input.industry).razorpay,
        addresses: { registered: { city: input.city, country: "IN" } },
      },
    },
  })
  return { accountId: account.id }
}

/**
 * Requests the "route" product for the linked account. `tnc_accepted: false` leaves KYC, bank
 * details and terms acceptance to Razorpay's hosted dashboard/email flow with the dealer directly.
 */
export async function requestRouteProduct(accountId: string): Promise<void> {
  const creds = razorpayCredentials()
  if (!creds) return
  await call(creds, `/v2/accounts/${encodeURIComponent(accountId)}/products`, {
    method: "POST",
    body: { product_name: "route", tnc_accepted: false },
  })
}

/** Current activation status of a linked account, for a manual "refresh status" fallback. */
export async function getAccountStatus(accountId: string): Promise<string | null> {
  const creds = razorpayCredentials()
  if (!creds) return null
  const account = await call<LinkedAccount>(creds, `/v2/accounts/${encodeURIComponent(accountId)}`)
  return account.status ?? null
}

/**
 * Creates an order for a buyer's booking payment, transferring the full amount straight to the
 * dealer's linked account (no platform cut).
 */
export async function createBookingOrder(input: {
  amount: number
  linkedAccountId: string
  notes: Record<string, string>
}): Promise<{ orderId: string } | null> {
  const creds = razorpayCredentials()
  if (!creds) return null
  const order = await call<{ id: string }>(creds, "/v1/orders", {
    method: "POST",
    body: {
      amount: input.amount * 100,
      currency: "INR",
      notes: input.notes,
      transfers: [{ account: input.linkedAccountId, amount: input.amount * 100, currency: "INR", on_hold: 0, notes: input.notes }],
    },
  })
  return { orderId: order.id }
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

/** Checkout signs `order_id|payment_id` with the API key secret — a different formula than subscriptions. */
export async function verifyBookingPaymentSignature(input: { orderId: string; paymentId: string; signature: string }): Promise<boolean> {
  const creds = razorpayCredentials()
  if (!creds) return false
  return safeEqual(await hmacHex(creds.keySecret, `${input.orderId}|${input.paymentId}`), input.signature)
}

/**
 * Creates an order for a food order's payment. The full amount transfers straight to the restaurant's linked account
 * (we never hold it). With no linked account the order is created without a transfer, which the caller only allows
 * for Razorpay test keys.
 */
export async function createFoodOrder(input: {
  amount: number
  receipt: string
  linkedAccountId: string | null
  notes: Record<string, string>
}): Promise<{ orderId: string } | null> {
  const creds = razorpayCredentials()
  if (!creds) return null
  const body: Record<string, unknown> = { amount: input.amount * 100, currency: "INR", receipt: input.receipt, notes: input.notes }
  if (input.linkedAccountId) body.transfers = [{ account: input.linkedAccountId, amount: input.amount * 100, currency: "INR", on_hold: 0, notes: input.notes }]
  const order = await call<{ id: string }>(creds, "/v1/orders", { method: "POST", body })
  return { orderId: order.id }
}

/**
 * Refunds a payment in full or part. For a Route payment, `reverseTransfer` also pulls the money back from the
 * restaurant's linked account, otherwise the platform would be out of pocket.
 */
export async function refundPayment(paymentId: string, amount: number, reverseTransfer: boolean): Promise<{ refundId: string }> {
  const creds = razorpayCredentials()
  if (!creds) throw new Error("Payments are not set up")
  const refund = await call<{ id: string }>(creds, `/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: "POST",
    body: { amount: amount * 100, speed: "normal", ...(reverseTransfer ? { reverse_all: 1 } : {}) },
  })
  return { refundId: refund.id }
}

export async function refundBookingPayment(paymentId: string, amount: number): Promise<void> {
  const creds = razorpayCredentials()
  if (!creds) return
  await call(creds, `/v1/payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", body: { amount: amount * 100 } })
}
