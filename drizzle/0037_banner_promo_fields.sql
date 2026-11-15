ALTER TABLE "banners" ADD COLUMN "button_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "link_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "tone" text DEFAULT 'soft' NOT NULL;