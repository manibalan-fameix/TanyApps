CREATE TABLE "security_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"business_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"outcome" text NOT NULL,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	CONSTRAINT "security_audit_outcome_ck" CHECK ("security_audit_events"."outcome" in ('success','denied','failed'))
);
--> statement-breakpoint
CREATE INDEX "security_audit_at_idx" ON "security_audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "security_audit_action_idx" ON "security_audit_events" USING btree ("action","at");--> statement-breakpoint
CREATE INDEX "security_audit_business_idx" ON "security_audit_events" USING btree ("business_id","at");--> statement-breakpoint
CREATE INDEX "security_audit_actor_idx" ON "security_audit_events" USING btree ("actor_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "security_audit_dedupe_uq" ON "security_audit_events" USING btree ("dedupe_key") WHERE "security_audit_events"."dedupe_key" is not null;
--> statement-breakpoint
-- Append-only: history cannot be rewritten through the application or an ordinary application role.
CREATE OR REPLACE FUNCTION security_audit_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_events is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER security_audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON security_audit_events
  FOR EACH ROW EXECUTE FUNCTION security_audit_events_immutable();
--> statement-breakpoint
CREATE TRIGGER security_audit_events_no_truncate
  BEFORE TRUNCATE ON security_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION security_audit_events_immutable();
