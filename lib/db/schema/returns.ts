import { sql } from "drizzle-orm"
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

import { customers } from "./cabs.ts"
import { dealers } from "./dealers.ts"
import { orders } from "./restaurant.ts"

/** What the customer has picked so far, before pressing Send to shop. Order lines have no ids, so a line is its position. */
export type ReturnDraft = { reason?: string; lines?: { position: number; qty: number }[]; photosDone?: boolean }

/**
 * One return, which is also one conversation between a customer and the shop (docs/returns/design.md). The order itself is never
 * changed by a return. Amounts are whole rupees.
 */
export const orderReturns = pgTable(
  "order_returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    /** Short number the two sides quote to each other, like R-4821. Unique within a shop. */
    code: text("code").notNull(),
    /** draft | requested | refund_due | refunded | rejected | withdrawn */
    status: text("status").notNull().default("draft"),
    /** Where the assistant is in collecting the facts: reason | items | photo | summary | done | outside */
    botStep: text("bot_step").notNull().default("reason"),
    draft: jsonb("draft").$type<ReturnDraft>().notNull().default({}),
    /** Whether the shop can see this conversation: the request was sent, or the customer wrote or asked for the shop. */
    withShop: boolean("with_shop").notNull().default(false),
    needsHelp: boolean("needs_help").notNull().default(false),
    /** Who has to act next: shop | customer | none. */
    waitingOn: text("waiting_on").notNull().default("customer"),
    waitingSince: timestamp("waiting_since", { withTimezone: true }).notNull().defaultNow(),
    /** The assistant says "I've saved this for the shop" only once. */
    savedNoteSent: boolean("saved_note_sent").notNull().default(false),
    /** After a finished return the customer may write once more, which brings it back to the shop. */
    followUpUsed: boolean("follow_up_used").notNull().default(false),
    /** Reason code of the request, from lib/returns/rules.ts. Null until it is sent. */
    reason: text("reason"),
    /** none: nothing was asked to come back. Pickup and drop-off arrive with physical returns. */
    resolution: text("resolution"),
    /** What the shop told the customer when rejecting (sealed). */
    shopNote: text("shop_note"),
    amountRequested: integer("amount_requested"),
    amountApproved: integer("amount_approved"),
    /** Why the approved amount differs from the system's figure (sealed). The customer sees it. */
    changeReason: text("change_reason"),
    /** none | due | refunded. In this version the shop pays outside the app and records it. */
    refundState: text("refund_state").notNull().default("none"),
    /** cash | upi | razorpay_dashboard */
    refundMethod: text("refund_method"),
    /** The shop's own reference for the payment (sealed). */
    refundRef: text("refund_ref"),
    /** The day the shop says it paid, as YYYY-MM-DD. */
    refundPaidOn: text("refund_paid_on"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    /** Set when the shop has not answered in the promised time and has been reminded. */
    overdueAt: timestamp("overdue_at", { withTimezone: true }),
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
    lastShopMessageAt: timestamp("last_shop_message_at", { withTimezone: true }),
    shopReadAt: timestamp("shop_read_at", { withTimezone: true }),
    customerReadAt: timestamp("customer_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_returns_dealer_code_uq").on(t.dealerId, t.code),
    // One open conversation per order. Finished ones do not count, so a later problem can still be reported.
    uniqueIndex("order_returns_one_open_uq").on(t.orderId).where(sql`${t.status} in ('draft', 'requested', 'refund_due')`),
    index("order_returns_inbox_idx").on(t.dealerId, t.withShop, t.waitingOn, t.waitingSince),
    index("order_returns_order_idx").on(t.orderId),
  ],
)

/** The items on a sent request. Name and price are copies, because order lines have no ids. */
export const orderReturnLines = pgTable(
  "order_return_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    returnId: uuid("return_id").notNull().references(() => orderReturns.id, { onDelete: "cascade" }),
    orderLine: integer("order_line").notNull(),
    itemId: text("item_id").notNull(),
    name: text("name").notNull(),
    qty: integer("qty").notNull(),
    unitPrice: integer("unit_price").notNull(),
    /** This line's share of the refund, in paise, before the total is rounded down to whole rupees. */
    refundPaise: integer("refund_paise").notNull(),
  },
  (t) => [uniqueIndex("order_return_lines_return_line_uq").on(t.returnId, t.orderLine), index("order_return_lines_dealer_idx").on(t.dealerId)],
)

/** The conversation, including every status change, so one list is both the chat and the history. Rows are never edited. */
export const returnMessages = pgTable(
  "return_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    returnId: uuid("return_id").notNull().references(() => orderReturns.id, { onDelete: "cascade" }),
    /** Order of messages, including several written at the same moment. */
    seq: serial("seq").notNull(),
    /** customer | assistant | shop | system */
    sender: text("sender").notNull(),
    /** The team member who wrote a shop message. */
    staffUserId: text("staff_user_id"),
    /** Plain text (sealed: a customer's words belong to the shop). */
    body: text("body").notNull().default(""),
    /** The status change a system message records, like approved or rejected. */
    event: text("event"),
    /** Sent by the browser with each message, so a retry never posts twice. */
    clientId: text("client_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("return_messages_return_idx").on(t.returnId, t.seq), uniqueIndex("return_messages_client_uq").on(t.returnId, t.clientId), index("return_messages_dealer_idx").on(t.dealerId)],
)

export const returnMedia = pgTable(
  "return_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealerId: uuid("dealer_id").notNull().references(() => dealers.id, { onDelete: "cascade" }),
    returnId: uuid("return_id").notNull().references(() => orderReturns.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => returnMessages.id, { onDelete: "cascade" }),
    /** Where the photo is in storage (sealed, so the database alone does not give its address). */
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("return_media_return_idx").on(t.returnId), index("return_media_dealer_idx").on(t.dealerId)],
)
