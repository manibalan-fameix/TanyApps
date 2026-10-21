CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'customer', 'driver', 'system', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('whatsapp', 'sms', 'push', 'email', 'wa_link');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'link_ready', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."recipient_type" AS ENUM('customer', 'driver', 'operator', 'staff');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"diff" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_optins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"recipient_hash" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"event" text NOT NULL,
	"recipient_type" "recipient_type" NOT NULL,
	"recipient_id" uuid,
	"recipient_enc" text NOT NULL,
	"recipient_hash" text NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_ref" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_optins" ADD CONSTRAINT "notification_optins_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("dealer_id","entity","entity_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_dealer_at_idx" ON "audit_log" USING btree ("dealer_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_optins_uq" ON "notification_optins" USING btree ("dealer_id","recipient_hash","channel");--> statement-breakpoint
CREATE INDEX "notifications_dealer_created_idx" ON "notifications" USING btree ("dealer_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("status","next_attempt_at");
--> statement-breakpoint
-- audit_log is append-only: who did what is only worth anything if it cannot be edited afterwards.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
