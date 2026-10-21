CREATE TYPE "public"."blocked_resource" AS ENUM('vehicle', 'driver');--> statement-breakpoint
CREATE TYPE "public"."driver_doc_type" AS ENUM('licence', 'badge', 'id_proof', 'police_verification', 'medical');--> statement-breakpoint
CREATE TYPE "public"."driver_employment" AS ENUM('employee', 'attached', 'freelance');--> statement-breakpoint
CREATE TYPE "public"."driver_status" AS ENUM('available', 'on_trip', 'off', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."route_source" AS ENUM('google', 'osrm', 'manual');--> statement-breakpoint
CREATE TYPE "public"."surcharge_kind" AS ENUM('night', 'hill', 'permit', 'airport', 'festival');--> statement-breakpoint
CREATE TYPE "public"."trip_type" AS ENUM('airport', 'outstation_one_way', 'outstation_round', 'local_hourly', 'package_tour');--> statement-breakpoint
CREATE TYPE "public"."vehicle_doc_type" AS ENUM('rc', 'insurance', 'permit', 'fc', 'puc', 'tax');--> statement-breakpoint
CREATE TYPE "public"."vehicle_fuel" AS ENUM('petrol', 'diesel', 'cng', 'electric', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."vehicle_ownership" AS ENUM('own', 'attached');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('active', 'maintenance', 'inactive');--> statement-breakpoint
CREATE TABLE "blocked_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"resource_type" "blocked_resource" NOT NULL,
	"resource_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_periods_range_ck" CHECK ("blocked_periods"."ends_at" > "blocked_periods"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "cab_settings" (
	"dealer_id" uuid PRIMARY KEY NOT NULL,
	"advance_bps" integer,
	"cancellation_policy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"night_start" text,
	"night_end" text,
	"gst_rate_bps" integer,
	"sac_code" text,
	"gstin" text,
	"state_code" text,
	"invoice_prefix" text,
	"min_lead_minutes" integer DEFAULT 0 NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"service_cities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cab_settings_bps_ck" CHECK (coalesce("cab_settings"."advance_bps",0) between 0 and 10000 and coalesce("cab_settings"."gst_rate_bps",0) between 0 and 10000),
	CONSTRAINT "cab_settings_state_ck" CHECK ("cab_settings"."state_code" is null or "cab_settings"."state_code" ~ '^[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "driver_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"type" "driver_doc_type" NOT NULL,
	"number" text,
	"valid_till" date,
	"file_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_duty_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_hash" text NOT NULL,
	"licence_enc" text,
	"licence_hash" text,
	"licence_valid_till" date,
	"badge_no" text,
	"employment" "driver_employment" DEFAULT 'employee' NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "driver_status" DEFAULT 'available' NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"days" integer NOT NULL,
	"itinerary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vehicle_class_prices" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_dealer_slug_uq" UNIQUE("dealer_id","slug"),
	CONSTRAINT "packages_days_ck" CHECK ("packages"."days" between 1 and 60)
);
--> statement-breakpoint
CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"vehicle_class_id" uuid NOT NULL,
	"trip_type" "trip_type" NOT NULL,
	"base_paise" integer,
	"per_km_paise" integer,
	"min_km_per_day" integer,
	"per_hour_paise" integer,
	"package_hours" integer,
	"package_km" integer,
	"extra_km_paise" integer,
	"extra_hour_paise" integer,
	"bata_per_day_paise" integer,
	"valid_from" date,
	"valid_to" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_cards_money_ck" CHECK (coalesce("rate_cards"."base_paise",0) >= 0 and coalesce("rate_cards"."per_km_paise",0) >= 0 and coalesce("rate_cards"."per_hour_paise",0) >= 0 and coalesce("rate_cards"."extra_km_paise",0) >= 0 and coalesce("rate_cards"."extra_hour_paise",0) >= 0 and coalesce("rate_cards"."bata_per_day_paise",0) >= 0),
	CONSTRAINT "rate_cards_dates_ck" CHECK ("rate_cards"."valid_from" is null or "rate_cards"."valid_to" is null or "rate_cards"."valid_to" >= "rate_cards"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "rate_surcharges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"kind" "surcharge_kind" NOT NULL,
	"label" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"amount_paise" integer,
	"bps" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_surcharges_one_of_ck" CHECK (("rate_surcharges"."amount_paise" is not null and "rate_surcharges"."bps" is null) or ("rate_surcharges"."amount_paise" is null and "rate_surcharges"."bps" is not null)),
	CONSTRAINT "rate_surcharges_nonneg_ck" CHECK (coalesce("rate_surcharges"."amount_paise",0) >= 0 and coalesce("rate_surcharges"."bps",0) between 0 and 100000)
);
--> statement-breakpoint
CREATE TABLE "route_distances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_place_id" text NOT NULL,
	"dest_place_id" text NOT NULL,
	"distance_m" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"toll_estimate_paise" integer,
	"source" "route_source" NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_distances_pos_ck" CHECK ("route_distances"."distance_m" >= 0 and "route_distances"."duration_s" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vehicle_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"seats" integer NOT NULL,
	"bags" integer DEFAULT 0 NOT NULL,
	"ac" boolean DEFAULT true NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_classes_dealer_name_uq" UNIQUE("dealer_id","name"),
	CONSTRAINT "vehicle_classes_seats_ck" CHECK ("vehicle_classes"."seats" between 1 and 60),
	CONSTRAINT "vehicle_classes_bags_ck" CHECK ("vehicle_classes"."bags" between 0 and 60)
);
--> statement-breakpoint
CREATE TABLE "vehicle_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"type" "vehicle_doc_type" NOT NULL,
	"number" text,
	"valid_from" date,
	"valid_till" date,
	"file_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"reg_enc" text NOT NULL,
	"reg_hash" text NOT NULL,
	"reg_prefix" text DEFAULT '' NOT NULL,
	"make_model" text NOT NULL,
	"year" integer,
	"colour" text,
	"fuel" "vehicle_fuel",
	"ownership" "vehicle_ownership" DEFAULT 'own' NOT NULL,
	"odometer_km" integer DEFAULT 0 NOT NULL,
	"status" "vehicle_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_odometer_ck" CHECK ("vehicles"."odometer_km" >= 0)
);
--> statement-breakpoint
ALTER TABLE "blocked_periods" ADD CONSTRAINT "blocked_periods_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cab_settings" ADD CONSTRAINT "cab_settings_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_duty_logs" ADD CONSTRAINT "driver_duty_logs_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_duty_logs" ADD CONSTRAINT "driver_duty_logs_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_vehicle_class_id_vehicle_classes_id_fk" FOREIGN KEY ("vehicle_class_id") REFERENCES "public"."vehicle_classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_surcharges" ADD CONSTRAINT "rate_surcharges_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_classes" ADD CONSTRAINT "vehicle_classes_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_class_id_vehicle_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."vehicle_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocked_periods_resource_idx" ON "blocked_periods" USING btree ("dealer_id","resource_type","resource_id","starts_at");--> statement-breakpoint
CREATE INDEX "driver_documents_driver_idx" ON "driver_documents" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "driver_documents_expiry_idx" ON "driver_documents" USING btree ("dealer_id","valid_till");--> statement-breakpoint
CREATE INDEX "driver_duty_driver_idx" ON "driver_duty_logs" USING btree ("dealer_id","driver_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drivers_dealer_phone_uq" ON "drivers" USING btree ("dealer_id","phone_hash");--> statement-breakpoint
CREATE INDEX "drivers_dealer_status_idx" ON "drivers" USING btree ("dealer_id","status");--> statement-breakpoint
CREATE INDEX "rate_cards_lookup_idx" ON "rate_cards" USING btree ("dealer_id","vehicle_class_id","trip_type");--> statement-breakpoint
CREATE INDEX "rate_surcharges_dealer_idx" ON "rate_surcharges" USING btree ("dealer_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "route_distances_pair_uq" ON "route_distances" USING btree ("origin_place_id","dest_place_id","source");--> statement-breakpoint
CREATE INDEX "vehicle_documents_vehicle_idx" ON "vehicle_documents" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_documents_expiry_idx" ON "vehicle_documents" USING btree ("dealer_id","valid_till");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_dealer_reg_uq" ON "vehicles" USING btree ("dealer_id","reg_hash");--> statement-breakpoint
CREATE INDEX "vehicles_dealer_status_idx" ON "vehicles" USING btree ("dealer_id","status");