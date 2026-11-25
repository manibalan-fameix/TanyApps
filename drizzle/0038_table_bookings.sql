CREATE TABLE "table_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"guests" integer NOT NULL,
	"booking_date" text NOT NULL,
	"booking_time" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_bookings" ADD CONSTRAINT "table_bookings_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_bookings_dealer_idx" ON "table_bookings" USING btree ("dealer_id","status");