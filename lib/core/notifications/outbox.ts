import { eq } from "drizzle-orm"

import { blindIndex, normalizePhone, phoneHash } from "../../crypto/blind-index"
import { decrypt, encrypt } from "../../crypto"
import { notifications } from "../../db/schema"
import type { ScopedDb } from "../../db/scoped"
import { buildWaLink, waLinkChannel } from "./channels/wa-link"
import type { Channel, Notification, NotificationChannelName, RecipientType } from "./types"

export type EnqueueInput = {
  event: string
  recipientType: RecipientType
  /** The customer / driver / staff row this is for, when there is one. */
  recipientId?: string
  /** A phone number for whatsapp, sms and wa_link; an address for email. Stored encrypted. */
  recipient: string
  channel: NotificationChannelName
  template: string
  /** Template variables. For wa_link, `text` is the message. Keep personal data out of it. */
  payload?: Record<string, unknown>
}

/** The channels that exist today. Adapters for the rest register here when their phase builds them. */
const CHANNELS: Partial<Record<NotificationChannelName, Channel>> = { wa_link: waLinkChannel }

export const channelFor = (name: NotificationChannelName) => CHANNELS[name]

const isPhoneChannel = (c: NotificationChannelName) => c === "whatsapp" || c === "sms" || c === "wa_link"

/**
 * Writes a notification to the outbox for the dealer behind `db`. Call it with the same scoped handle (and transaction) as
 * the change that caused it, so a booking and its "booking confirmed" message exist together or not at all.
 *
 * A wa_link notification needs no worker: it is `link_ready` straight away. Anything else is `pending` until the sender
 * (Phase 4) picks it up. A channel nobody has built yet stays `pending`; it is never silently dropped.
 */
export async function enqueue(db: ScopedDb, input: EnqueueInput): Promise<string> {
  let recipient = input.recipient.trim()
  if (isPhoneChannel(input.channel)) {
    const phone = normalizePhone(recipient)
    if (!phone) throw new Error("enqueue: recipient is not a valid mobile number")
    recipient = phone
  }
  const hash = isPhoneChannel(input.channel) ? phoneHash(recipient) : blindIndex("email", recipient.toLowerCase())

  const [row] = await db.notifications
    .insert({
      event: input.event,
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      recipientEnc: encrypt(recipient),
      recipientHash: hash,
      channel: input.channel,
      template: input.template,
      payload: input.payload ?? {},
      status: input.channel === "wa_link" ? "link_ready" : "pending",
    })
    .returning({ id: notifications.id })
  return row.id
}

/** The wa.me link for a wa_link notification, built on demand from the encrypted recipient. Null for any other kind. */
export async function waLinkFor(db: ScopedDb, notificationId: string): Promise<string | null> {
  const [n] = await db.notifications.select(eq(notifications.id, notificationId), { limit: 1 })
  if (!n || n.channel !== "wa_link") return null
  return buildWaLink(decrypt(n.recipientEnc), n as Notification)
}
