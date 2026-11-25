"use server"

import { revalidatePath } from "next/cache"

import { industrySession } from "@/lib/core/guards"
import { canRefund } from "@/lib/core/permissions"
import { rateLimit } from "@/lib/core/rate-limit"
import { returnsConfigured } from "@/lib/returns/rules"
import { type InboxRow, type ReturnAlert, type ShopResult, type ShopThread, approve, approveSchema, closeConversation, inbox, paybackSchema, recordPayback, reject, rejectSchema, replySchema, returnAlerts, shopPhotoKey, shopReply, shopThread, waitingCount } from "@/lib/returns/shop"
import { getStorage } from "@/lib/storage"
import { ORDER_INDUSTRIES } from "@/lib/verticals"

const denied: ShopResult = { ok: false, error: "Please sign in again." }
const ownerOnly: ShopResult = { ok: false, error: "Only the owner can approve a refund or record one." }

const session = () => industrySession(ORDER_INDUSTRIES)

function refresh(result: ShopResult): ShopResult {
  if (result.ok) {
    revalidatePath("/returns")
    revalidatePath("/orders", "layout")
  }
  return result
}

export async function fetchReturnInbox(): Promise<{ ok: true; rows: InboxRow[] } | { ok: false }> {
  const s = await session()
  if (!s) return { ok: false }
  return { ok: true, rows: await inbox(s.dealer.id) }
}

/** One conversation. `visible` is false when the tab is hidden, so unread messages are not marked as seen. */
export async function fetchReturnThread(id: string, visible: boolean): Promise<{ ok: true; thread: ShopThread } | { ok: false; error: string }> {
  const s = await session()
  if (!s) return { ok: false, error: "Please sign in again." }
  const thread = await shopThread(s.dealer.id, String(id), visible === true)
  return thread ? { ok: true, thread } : { ok: false, error: "That conversation was not found." }
}

/** New return activity for the admin's pop-up and bell, and how many conversations are waiting for the shop. */
export async function fetchReturnAlerts(since: string | null): Promise<{ ok: true; alerts: ReturnAlert[]; waiting: number } | { ok: false }> {
  const s = await session()
  if (!s) return { ok: false }
  // A shop that has never set returns up has no conversations to look for.
  if (!returnsConfigured(s.dealer.profile)) return { ok: true, alerts: [], waiting: 0 }
  const after = since ? new Date(since) : null
  const [alerts, waiting] = await Promise.all([returnAlerts(s.dealer.id, after && !Number.isNaN(after.getTime()) ? after : null), waitingCount(s.dealer.id)])
  return { ok: true, alerts, waiting }
}

export async function replyToReturn(id: string, input: unknown): Promise<ShopResult> {
  const s = await session()
  if (!s) return denied
  const parsed = replySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  if (!(await rateLimit(`return-reply:${s.dealer.id}:${s.userId}`, 120, 5 * 60_000))) return { ok: false, error: "Too many messages. Please wait a moment." }
  const keys = [...new Set(parsed.data.photos)].map((p) => shopPhotoKey(s.dealer.id, p))
  for (const key of keys) if (!(await getStorage().head(key))) return { ok: false, error: "A photo did not finish uploading. Please add it again." }
  return refresh(await shopReply(s.dealer.id, { userId: s.userId }, String(id), parsed.data, keys))
}

export async function approveReturn(id: string, input: unknown): Promise<ShopResult> {
  const s = await session()
  if (!s) return denied
  if (!canRefund(s.owner ? "owner" : "staff")) return ownerOnly
  const parsed = approveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  return refresh(await approve(s.dealer.id, { userId: s.userId }, String(id), parsed.data))
}

export async function rejectReturn(id: string, input: unknown): Promise<ShopResult> {
  const s = await session()
  if (!s) return denied
  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  return refresh(await reject(s.dealer.id, { userId: s.userId }, String(id), parsed.data))
}

export async function recordReturnPayback(id: string, input: unknown): Promise<ShopResult> {
  const s = await session()
  if (!s) return denied
  if (!canRefund(s.owner ? "owner" : "staff")) return ownerOnly
  const parsed = paybackSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  return refresh(await recordPayback(s.dealer.id, { userId: s.userId }, String(id), parsed.data))
}

export async function closeReturnConversation(id: string): Promise<ShopResult> {
  const s = await session()
  if (!s) return denied
  return refresh(await closeConversation(s.dealer.id, { userId: s.userId }, String(id)))
}
