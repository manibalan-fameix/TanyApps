import type { notifications } from "../../db/schema"

export type Notification = typeof notifications.$inferSelect
export type NotificationChannelName = Notification["channel"]
export type RecipientType = Notification["recipientType"]

/** What a channel reports after handling one notification. */
export type SendResult =
  /** Delivered to the provider. */
  | { status: "sent"; providerRef: string }
  /** Nothing is sent by us; a link is ready for a person to tap (wa.me). */
  | { status: "link_ready" }
  /** The provider refused or was unreachable. `retry` says whether trying again can help. */
  | { status: "failed"; error: string; retry: boolean }

/**
 * A way of reaching a person. WhatsApp Cloud API, SMS, push and email each implement this in the phase that needs them; the
 * outbox only talks to this interface. `recipient` is already decrypted for the call and must not be logged.
 */
export interface Channel {
  readonly name: NotificationChannelName
  send(notification: Notification, recipient: string): Promise<SendResult>
}
