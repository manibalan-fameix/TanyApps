CREATE TABLE "customer_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_identities_provider_ck" CHECK ("customer_identities"."provider" in ('google.com','facebook.com','password'))
);
--> statement-breakpoint
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_identities" ADD CONSTRAINT "customer_identities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_identities_dealer_subject_uq" ON "customer_identities" USING btree ("dealer_id","subject_hash");--> statement-breakpoint
CREATE INDEX "customer_identities_customer_idx" ON "customer_identities" USING btree ("customer_id");