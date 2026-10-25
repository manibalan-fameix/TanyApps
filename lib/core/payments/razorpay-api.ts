import { razorpayCredentials } from "../../billing/razorpay"
import { getVertical } from "../../verticals"

const API = "https://api.razorpay.com"

type Credentials = { keyId: string; keySecret: string }

/** Razorpay answered, but not with a usable success. `status` is the HTTP status (a 2xx with an unreadable body lands here too). */
export class RazorpayError extends Error {
  constructor(
    readonly status: number,
    description: string,
  ) {
    super(`Razorpay ${status}: ${description}`)
    this.name = "RazorpayError"
  }
}

async function call<T>(creds: Credentials, path: string, init?: { method: "POST"; body: unknown; headers?: Record<string, string> }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      ...init?.headers,
      authorization: `Basic ${btoa(`${creds.keyId}:${creds.keySecret}`)}`,
      "content-type": "application/json",
    },
    body: init ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  const json = (await res.json().catch(() => null)) as (T & { error?: { description?: string } }) | null
  if (!res.ok || !json) throw new RazorpayError(res.status, json?.error?.description ?? "request failed")
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
export async function verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): Promise<boolean> {
  const creds = razorpayCredentials()
  if (!creds) return false
  return safeEqual(await hmacHex(creds.keySecret, `${input.orderId}|${input.paymentId}`), input.signature)
}

/** What a payment is for. The webhook dispatches on this (see ./webhook.ts), so every order must carry one in `notes.kind`. */
export type PaymentKind = "eats_order" | "motors_booking"

/**
 * Creates a Razorpay order. When `linkedAccountId` is set the full amount transfers straight to that business's linked
 * account (we never hold it); without one the order is created with no transfer, which callers only allow for Razorpay
 * test keys. `kind` is written into `notes.kind` so the webhook knows which flow the payment belongs to.
 */
export async function createRouteOrder(input: {
  kind: PaymentKind
  /** Whole rupees. */
  amount: number
  receipt?: string
  linkedAccountId: string | null
  notes: Record<string, string>
}): Promise<{ orderId: string } | null> {
  const creds = razorpayCredentials()
  if (!creds) return null
  const notes = { ...input.notes, kind: input.kind }
  const body: Record<string, unknown> = { amount: input.amount * 100, currency: "INR", notes }
  if (input.receipt) body.receipt = input.receipt
  if (input.linkedAccountId) body.transfers = [{ account: input.linkedAccountId, amount: input.amount * 100, currency: "INR", on_hold: 0, notes }]
  const order = await call<{ id: string }>(creds, "/v1/orders", { method: "POST", body })
  return { orderId: order.id }
}

/** What Razorpay reports for a refund: `pending` is accepted and on its way (normal-speed refunds start here), `processed` is settled. */
export type RefundStatus = "pending" | "processed"
export type RefundResult = { refundId: string; status: RefundStatus; /** True when the refund was found already created rather than created by this call. */ reconciled?: boolean }

/**
 * Why a refund call threw. All three are safe to retry with the same key; callers treat any throw as "not refunded yet".
 *  - rejected:  Razorpay refused it (balance, state). Nothing was created.
 *  - failed:    Razorpay created the refund and it failed.
 *  - ambiguous: the outcome is unknown (timeout, 5xx, 409 in progress) and no matching refund was found when we looked.
 */
export class RefundError extends Error {
  constructor(
    readonly kind: "rejected" | "failed" | "ambiguous",
    message: string,
  ) {
    super(message)
    this.name = "RefundError"
  }
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{10,}$/
const KEY_NOTE = "tany_refund_key"

/**
 * The key for one logical refund: this payment, this amount. Every retry of the same refund yields the same key (Razorpay then
 * returns the original refund instead of making another); a different amount is a different refund. Whole rupees in, as everywhere.
 */
export const refundIdempotencyKey = (paymentId: string, amount: number): string => `tany_rf_${paymentId}_${amount * 100}`

type RazorpayRefund = { id: string; amount?: number; status?: string; notes?: Record<string, unknown> | unknown[] }

const statusOf = (r: RazorpayRefund): RefundStatus | "failed" => (r.status === "failed" ? "failed" : r.status === "processed" ? "processed" : "pending")

/**
 * Looks for the refund a previous attempt may have created. A refund carrying our key wins; otherwise one for the same amount
 * that has no key at all (made before keys existed). A failed refund never counts, since the money did not move.
 */
async function findRefund(creds: Credentials, paymentId: string, paise: number, key: string): Promise<RefundResult | null> {
  const list = await call<{ items?: RazorpayRefund[] }>(creds, `/v1/payments/${encodeURIComponent(paymentId)}/refunds?count=100`)
  const noteOf = (r: RazorpayRefund) => (Array.isArray(r.notes) ? undefined : r.notes?.[KEY_NOTE])
  const live = (list.items ?? []).filter((r) => r.amount === paise && statusOf(r) !== "failed")
  const hit = live.find((r) => noteOf(r) === key) ?? live.find((r) => noteOf(r) === undefined)
  return hit ? { refundId: hit.id, status: statusOf(hit) as RefundStatus, reconciled: true } : null
}

/**
 * Refunds a payment in full or part. For a Route payment, `reverseTransfer` also pulls the money back from the
 * restaurant's linked account, otherwise the platform would be out of pocket.
 *
 * Safe to call again after a crash or a timeout: every attempt for the same payment and amount carries the same
 * `X-Refund-Idempotency` key and an identical body, so Razorpay returns the refund it already made. If the answer is lost or
 * unclear (409, 5xx, timeout, unreadable body) the payment's refunds are checked before giving up, so a refund that exists is
 * adopted and never repeated. Not for use inside a database transaction.
 */
export async function refundPayment(paymentId: string, amount: number, reverseTransfer: boolean, opts: { idempotencyKey?: string } = {}): Promise<RefundResult> {
  const creds = razorpayCredentials()
  if (!creds) throw new Error("Payments are not set up")
  const key = opts.idempotencyKey ?? refundIdempotencyKey(paymentId, amount)
  if (!IDEMPOTENCY_KEY.test(key)) throw new RefundError("rejected", "Refund idempotency key must be 10+ characters of letters, digits, _ or -")
  const paise = amount * 100
  const path = `/v1/payments/${encodeURIComponent(paymentId)}/refund`

  let refund: RazorpayRefund
  try {
    // The body must be identical on every retry of this refund: same fields, same order.
    refund = await call<RazorpayRefund>(creds, path, {
      method: "POST",
      body: { amount: paise, speed: "normal", ...(reverseTransfer ? { reverse_all: 1 } : {}), notes: { [KEY_NOTE]: key } },
      headers: { "X-Refund-Idempotency": key },
    })
    // A 2xx that does not describe a refund is not proof of one either way: look before deciding.
    if (typeof refund.id !== "string") throw new RazorpayError(200, "response had no refund id")
  } catch (error) {
    // 4xx other than 400/409 is a plain refusal (auth, not found, rate limit): nothing was created.
    if (error instanceof RazorpayError && error.status >= 400 && error.status < 500 && error.status !== 400 && error.status !== 409) throw error
    // Otherwise the refund may exist: a lost answer, a request still in progress (409), or one made before keys (400 "already refunded").
    let found: RefundResult | null = null
    try {
      found = await findRefund(creds, paymentId, paise, key)
    } catch {
      // Could not look either; fall through with the original error.
    }
    if (found) return found
    if (error instanceof RazorpayError && error.status === 400) throw error // refused, and there is no refund to adopt
    const why = error instanceof Error ? error.message : "unknown"
    throw new RefundError("ambiguous", `Refund outcome unknown (${why}). Retrying is safe.`)
  }
  if (statusOf(refund) === "failed") throw new RefundError("failed", `Razorpay created refund ${refund.id} but it failed`)
  return { refundId: refund.id, status: statusOf(refund) as RefundStatus }
}

/** Razorpay's current status for a refund we created: how a `pending` refund is seen to finish or fail. */
export async function getRefundStatus(refundId: string): Promise<RefundStatus | "failed"> {
  const creds = razorpayCredentials()
  if (!creds) throw new Error("Payments are not set up")
  return statusOf(await call<RazorpayRefund>(creds, `/v1/refunds/${encodeURIComponent(refundId)}`))
}

/**
 * Whether a failed refund can never succeed by simply trying again, so automatic retries should stop and a person should look:
 * Razorpay created the refund and it failed, or it refused the request itself (a 4xx other than "in progress" 409 and "slow down"
 * 429). Anything ambiguous or temporary (a timeout, a 5xx, a refund whose outcome is unknown) is NOT final: the stable
 * idempotency key makes trying again safe.
 */
export function isFinalRefundFailure(error: unknown): boolean {
  if (error instanceof RefundError) return error.kind === "failed"
  if (error instanceof RazorpayError) return error.status >= 400 && error.status < 500 && error.status !== 409 && error.status !== 429
  return false
}

/**
 * The captured payment on a Razorpay order, if there is one (a read; it moves no money). Used to find payments whose notification
 * never reached us: before an unpaid order is given up on, Razorpay is asked whether it was in fact paid.
 */
export async function getCapturedPaymentId(razorpayOrderId: string): Promise<string | null> {
  const creds = razorpayCredentials()
  if (!creds) throw new Error("Payments are not set up")
  const r = await call<{ items?: { id: string; status: string }[] }>(creds, `/v1/orders/${encodeURIComponent(razorpayOrderId)}/payments`)
  return r.items?.find((p) => p.status === "captured")?.id ?? null
}
