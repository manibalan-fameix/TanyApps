ALTER TABLE "orders" ADD COLUMN "customer_phone_hash" text;--> statement-breakpoint
CREATE INDEX "orders_dealer_phone_hash_idx" ON "orders" USING btree ("dealer_id","customer_phone_hash");