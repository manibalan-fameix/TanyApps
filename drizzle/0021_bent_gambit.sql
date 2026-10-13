CREATE TABLE "order_locations" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"dealer_id" uuid NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy" double precision,
	"heading" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rider_token_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rider_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_locations" ADD CONSTRAINT "order_locations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_locations" ADD CONSTRAINT "order_locations_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_locations_dealer_idx" ON "order_locations" USING btree ("dealer_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_token_hash_unique" UNIQUE("rider_token_hash");