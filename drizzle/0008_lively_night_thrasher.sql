ALTER TABLE "dealers" ADD COLUMN "next_plan" text;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "next_billing_cycle" text;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "next_plan_starts_at" timestamp with time zone;