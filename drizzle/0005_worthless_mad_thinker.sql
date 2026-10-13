ALTER TABLE "dealers" ADD COLUMN "billing_cycle" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "dealers" ADD COLUMN "subscription_status" text;