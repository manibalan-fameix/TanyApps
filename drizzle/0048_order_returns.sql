CREATE TABLE "order_return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"order_line" integer NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"refund_paise" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid,
	"code" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"bot_step" text DEFAULT 'reason' NOT NULL,
	"draft" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"with_shop" boolean DEFAULT false NOT NULL,
	"needs_help" boolean DEFAULT false NOT NULL,
	"waiting_on" text DEFAULT 'customer' NOT NULL,
	"waiting_since" timestamp with time zone DEFAULT now() NOT NULL,
	"saved_note_sent" boolean DEFAULT false NOT NULL,
	"follow_up_used" boolean DEFAULT false NOT NULL,
	"reason" text,
	"resolution" text,
	"shop_note" text,
	"amount_requested" integer,
	"amount_approved" integer,
	"change_reason" text,
	"refund_state" text DEFAULT 'none' NOT NULL,
	"refund_method" text,
	"refund_ref" text,
	"refund_paid_on" text,
	"requested_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"overdue_at" timestamp with time zone,
	"last_customer_message_at" timestamp with time zone,
	"last_shop_message_at" timestamp with time zone,
	"shop_read_at" timestamp with time zone,
	"customer_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"seq" serial NOT NULL,
	"sender" text NOT NULL,
	"staff_user_id" text,
	"body" text DEFAULT '' NOT NULL,
	"event" text,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_return_lines" ADD CONSTRAINT "order_return_lines_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_return_lines" ADD CONSTRAINT "order_return_lines_return_id_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_returns" ADD CONSTRAINT "order_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_media" ADD CONSTRAINT "return_media_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_media" ADD CONSTRAINT "return_media_return_id_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_media" ADD CONSTRAINT "return_media_message_id_return_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."return_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_messages" ADD CONSTRAINT "return_messages_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_messages" ADD CONSTRAINT "return_messages_return_id_order_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."order_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_return_lines_return_line_uq" ON "order_return_lines" USING btree ("return_id","order_line");--> statement-breakpoint
CREATE INDEX "order_return_lines_dealer_idx" ON "order_return_lines" USING btree ("dealer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_returns_dealer_code_uq" ON "order_returns" USING btree ("dealer_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "order_returns_one_open_uq" ON "order_returns" USING btree ("order_id") WHERE "order_returns"."status" in ('draft', 'requested', 'refund_due');--> statement-breakpoint
CREATE INDEX "order_returns_inbox_idx" ON "order_returns" USING btree ("dealer_id","with_shop","waiting_on","waiting_since");--> statement-breakpoint
CREATE INDEX "order_returns_order_idx" ON "order_returns" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "return_media_return_idx" ON "return_media" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX "return_media_dealer_idx" ON "return_media" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "return_messages_return_idx" ON "return_messages" USING btree ("return_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "return_messages_client_uq" ON "return_messages" USING btree ("return_id","client_id");--> statement-breakpoint
CREATE INDEX "return_messages_dealer_idx" ON "return_messages" USING btree ("dealer_id");