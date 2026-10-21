CREATE TYPE "public"."cron_run_status" AS ENUM('running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"slot" timestamp with time zone NOT NULL,
	"status" "cron_run_status" DEFAULT 'running' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cron_runs_job_slot_uq" ON "cron_runs" USING btree ("job","slot");--> statement-breakpoint
CREATE INDEX "cron_runs_started_idx" ON "cron_runs" USING btree ("started_at");