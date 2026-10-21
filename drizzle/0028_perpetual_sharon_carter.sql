CREATE TYPE "public"."trip_actor_type" AS ENUM('customer', 'operator', 'system', 'driver');--> statement-breakpoint
CREATE TYPE "public"."trip_source" AS ENUM('web', 'phone', 'walk_in', 'corporate');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('requested', 'confirmed', 'assigned', 'driver_en_route', 'arrived', 'in_trip', 'completed', 'closed', 'rejected', 'cancelled', 'expired', 'no_show');--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text NOT NULL,
	"address_enc" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"place_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_hash" text NOT NULL,
	"name" text,
	"email_enc" text,
	"verified_at" timestamp with time zone,
	"language" text DEFAULT 'en' NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_language_ck" CHECK ("customers"."language" in ('en','ta'))
);
--> statement-breakpoint
CREATE TABLE "trip_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" "trip_status",
	"to_status" "trip_status",
	"actor_type" "trip_actor_type" NOT NULL,
	"actor_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"code" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"trip_type" "trip_type" NOT NULL,
	"status" "trip_status" DEFAULT 'requested' NOT NULL,
	"source" "trip_source" DEFAULT 'web' NOT NULL,
	"booked_by_type" "trip_actor_type" DEFAULT 'customer' NOT NULL,
	"booked_by_id" text,
	"pickup" jsonb NOT NULL,
	"drop" jsonb,
	"start_at" timestamp with time zone NOT NULL,
	"return_at" timestamp with time zone,
	"pax" integer NOT NULL,
	"bags" integer DEFAULT 0 NOT NULL,
	"notes_enc" text,
	"vehicle_class_id" uuid NOT NULL,
	"package_id" uuid,
	"quote" jsonb NOT NULL,
	"quote_total_paise" integer NOT NULL,
	"advance_due_paise" integer DEFAULT 0 NOT NULL,
	"advance_paid_paise" integer DEFAULT 0 NOT NULL,
	"adjusted_total_paise" integer,
	"adjustment_reason" text,
	"hold_expires_at" timestamp with time zone,
	"hold_alert_at" timestamp with time zone,
	"hold_alerted_at" timestamp with time zone,
	"share_token_hash" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"reject_reason" text,
	"cancelled_reason" text,
	"cancelled_by_type" "trip_actor_type",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_code_ck" CHECK ("trips"."code" ~ '^[A-Z0-9]{6}$'),
	CONSTRAINT "trips_money_ck" CHECK ("trips"."quote_total_paise" >= 0 and "trips"."advance_due_paise" between 0 and "trips"."quote_total_paise" and "trips"."advance_paid_paise" >= 0 and coalesce("trips"."adjusted_total_paise",0) >= 0),
	CONSTRAINT "trips_pax_ck" CHECK ("trips"."pax" between 1 and 60 and "trips"."bags" between 0 and 60),
	CONSTRAINT "trips_return_ck" CHECK ("trips"."return_at" is null or "trips"."return_at" > "trips"."start_at")
);
--> statement-breakpoint
ALTER TABLE "cab_settings" ADD COLUMN "respond_window_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "cab_settings" ADD COLUMN "unpaid_hold_minutes" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_class_id_vehicle_classes_id_fk" FOREIGN KEY ("vehicle_class_id") REFERENCES "public"."vehicle_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("dealer_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_contacts_phone_uq" ON "customer_contacts" USING btree ("customer_id","phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_dealer_phone_uq" ON "customers" USING btree ("dealer_id","phone_hash");--> statement-breakpoint
CREATE INDEX "trip_events_trip_idx" ON "trip_events" USING btree ("dealer_id","trip_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_dealer_code_uq" ON "trips" USING btree ("dealer_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_share_token_uq" ON "trips" USING btree ("share_token_hash");--> statement-breakpoint
CREATE INDEX "trips_dealer_status_idx" ON "trips" USING btree ("dealer_id","status","start_at");--> statement-breakpoint
CREATE INDEX "trips_customer_idx" ON "trips" USING btree ("dealer_id","customer_id","created_at");--> statement-breakpoint
CREATE INDEX "trips_hold_idx" ON "trips" USING btree ("status","hold_expires_at");--> statement-breakpoint
ALTER TABLE "cab_settings" ADD CONSTRAINT "cab_settings_holds_ck" CHECK ("cab_settings"."respond_window_minutes" between 10 and 240 and "cab_settings"."unpaid_hold_minutes" between 5 and 240);