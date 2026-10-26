CREATE TABLE "team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"role" "dealer_role" DEFAULT 'staff' NOT NULL,
	"token_hash" text NOT NULL,
	"email_hash" text,
	"phone_hash" text,
	"contact_enc" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	CONSTRAINT "team_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "team_invites_staff_only" CHECK ("team_invites"."role" = 'staff'),
	CONSTRAINT "team_invites_has_contact" CHECK ("team_invites"."email_hash" is not null or "team_invites"."phone_hash" is not null)
);
--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_invites_dealer_idx" ON "team_invites" USING btree ("dealer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invites_open_email_uq" ON "team_invites" USING btree ("dealer_id","email_hash") WHERE "team_invites"."accepted_at" is null and "team_invites"."revoked_at" is null and "team_invites"."email_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "team_invites_open_phone_uq" ON "team_invites" USING btree ("dealer_id","phone_hash") WHERE "team_invites"."accepted_at" is null and "team_invites"."revoked_at" is null and "team_invites"."phone_hash" is not null;