CREATE TABLE "usage_counters" (
	"business_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"bucket" text NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"est_cost_micros" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_counters_business_id_feature_bucket_pk" PRIMARY KEY("business_id","feature","bucket")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_id" uuid NOT NULL,
	"product" text NOT NULL,
	"feature" text NOT NULL,
	"provider" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" bigint NOT NULL,
	"est_cost_micros" bigint,
	"billed_cost_micros" bigint,
	"period" text NOT NULL,
	"idempotency_key" text,
	CONSTRAINT "usage_events_qty_ck" CHECK ("usage_events"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "usage_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"feature" text NOT NULL,
	"included_monthly" bigint,
	"soft_pct" integer DEFAULT 80 NOT NULL,
	"abuse_daily" bigint,
	"mode" text DEFAULT 'observe' NOT NULL,
	"exempt" boolean DEFAULT false NOT NULL,
	"topup_quantity" bigint DEFAULT 0 NOT NULL,
	"est_unit_cost_micros" bigint,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_limits_mode_ck" CHECK ("usage_limits"."mode" in ('observe','enforce')),
	CONSTRAINT "usage_limits_soft_ck" CHECK ("usage_limits"."soft_pct" between 1 and 100)
);
--> statement-breakpoint
CREATE INDEX "usage_counters_bucket_idx" ON "usage_counters" USING btree ("bucket","feature");--> statement-breakpoint
CREATE INDEX "usage_events_business_period_idx" ON "usage_events" USING btree ("business_id","period","feature");--> statement-breakpoint
CREATE INDEX "usage_events_period_feature_idx" ON "usage_events" USING btree ("period","feature");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_idem_uq" ON "usage_events" USING btree ("idempotency_key") WHERE "usage_events"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_limits_default_uq" ON "usage_limits" USING btree ("feature") WHERE "usage_limits"."business_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_limits_business_uq" ON "usage_limits" USING btree ("business_id","feature") WHERE "usage_limits"."business_id" is not null;