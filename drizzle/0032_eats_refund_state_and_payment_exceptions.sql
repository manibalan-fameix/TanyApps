CREATE TABLE "payment_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"business_id" uuid,
	"detail" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution" text
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_error" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_exceptions_kind_ref_uq" ON "payment_exceptions" USING btree ("kind","ref");--> statement-breakpoint
CREATE INDEX "payment_exceptions_status_idx" ON "payment_exceptions" USING btree ("status","last_seen_at");