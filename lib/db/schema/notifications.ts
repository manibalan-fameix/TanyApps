import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { dealers } from "./dealers.ts"

export const notificationChannel = pgEnum("notification_channel", ["whatsapp", "sms", "push", "email", "wa_link"])
/** link_ready: a wa.me link was prepared for a person to tap; nothing is sent by us. */
export const notificationStatus = pgEnum("notification_status", ["pending", "sending", "sent", "failed", "link_ready", "skipped"])
export const recipientType = pgEnum("recipient_type", ["customer", "driver", "operator", "staff"])

/**
 * The outbox: every message the platform means to send, written in the same transaction as the thing that caused it, then
 * delivered by a worker with retries. The recipient's number or address is encrypted (`recipient_enc`); `recipient_hash` is a
 * keyed hash for lookups and for matching opt-ins, so nothing here is readable in a database dump.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    /** What happened, e.g. booking_confirmed. */
    event: text("event").notNull(),
    recipientType: recipientType("recipient_type").notNull(),
    /** The customer / driver / staff row this is for, when there is one. */
    recipientId: uuid("recipient_id"),
    /** AES-256-GCM (lib/crypto). A phone number or email address. */
    recipientEnc: text("recipient_enc").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    channel: notificationChannel("channel").notNull(),
    template: text("template").notNull(),
    /** Template variables and, for wa_link, the message text. Never put a phone number or address here. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: notificationStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    /** The provider's message id once sent. */
    providerRef: text("provider_ref"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("notifications_dealer_created_idx").on(t.dealerId, t.createdAt),
    // The sender's work queue: what is due, oldest first.
    index("notifications_due_idx").on(t.status, t.nextAttemptAt),
  ],
)

/** Who agreed to hear from us on which channel. Messages go only to recipients with an opt-in (enforced by the sender in Phase 4). */
export const notificationOptins = pgTable(
  "notification_optins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    recipientHash: text("recipient_hash").notNull(),
    channel: notificationChannel("channel").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    /** Where consent was given: booking_form, login, driver_invite... */
    source: text("source").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("notification_optins_uq").on(t.dealerId, t.recipientHash, t.channel)],
)
