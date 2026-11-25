"use server"

import { tenantContext } from "@/lib/core/guards"
import { currentCustomer } from "@/lib/core/login/customer"
import { rateLimit } from "@/lib/core/rate-limit"
import { type CustomerResult, messageSchema, openChat, readChat, sendCustomerMessage, stepSchema, takeStep } from "@/lib/returns/customer"
import { ORDER_INDUSTRIES } from "@/lib/verticals"

/** The customer's return chat. Every call needs this shop's signed-in customer; the logic checks the order is theirs. */

const signIn: CustomerResult = { ok: false, error: "Sign in with the phone number used on this order." }
const slowDown: CustomerResult = { ok: false, error: "That's a lot of messages. Please wait a few minutes." }

export async function openReturnChat(orderCode: string, startNew = false): Promise<CustomerResult> {
  const ctx = await tenantContext(ORDER_INDUSTRIES)
  const customer = ctx && (await currentCustomer(ctx.dealer.id))
  if (!ctx || !customer) return signIn
  if (!(await rateLimit(`return-open:${ctx.dealer.id}:${customer.id}`, 40, 10 * 60_000))) return slowDown
  return openChat({ dealer: ctx.dealer, customer }, String(orderCode), startNew === true)
}

/** Polled while the chat is on screen. */
export async function readReturnChat(returnId: string): Promise<CustomerResult> {
  const ctx = await tenantContext(ORDER_INDUSTRIES)
  const customer = ctx && (await currentCustomer(ctx.dealer.id))
  if (!ctx || !customer) return signIn
  if (!(await rateLimit(`return-read:${ctx.dealer.id}:${customer.id}`, 400, 10 * 60_000))) return slowDown
  return readChat({ dealer: ctx.dealer, customer }, String(returnId))
}

export async function pressReturnButton(returnId: string, input: unknown): Promise<CustomerResult> {
  const ctx = await tenantContext(ORDER_INDUSTRIES)
  const customer = ctx && (await currentCustomer(ctx.dealer.id))
  if (!ctx || !customer) return signIn
  if (!(await rateLimit(`return-step:${ctx.dealer.id}:${customer.id}`, 60, 10 * 60_000))) return slowDown
  const step = stepSchema.safeParse(input)
  if (!step.success) return { ok: false, error: "Choose again." }
  return takeStep({ dealer: ctx.dealer, customer }, String(returnId), step.data)
}

export async function sendReturnMessage(returnId: string, input: unknown): Promise<CustomerResult> {
  const ctx = await tenantContext(ORDER_INDUSTRIES)
  const customer = ctx && (await currentCustomer(ctx.dealer.id))
  if (!ctx || !customer) return signIn
  if (!(await rateLimit(`return-message:${ctx.dealer.id}:${customer.id}`, 20, 5 * 60_000))) return slowDown
  const message = messageSchema.safeParse(input)
  if (!message.success) return { ok: false, error: message.error.issues[0].message }
  return sendCustomerMessage({ dealer: ctx.dealer, customer }, String(returnId), message.data)
}
