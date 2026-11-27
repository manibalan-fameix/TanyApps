ALTER TABLE "dealer_domains" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "dealer_domains" ADD COLUMN "verification_token" text;--> statement-breakpoint
ALTER TABLE "dealer_domains" ADD COLUMN "cf_hostname_id" text;--> statement-breakpoint
ALTER TABLE "dealer_domains" ADD COLUMN "primary_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dealer_domains" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_domains_one_per_dealer_uq" ON "dealer_domains" USING btree ("dealer_id");