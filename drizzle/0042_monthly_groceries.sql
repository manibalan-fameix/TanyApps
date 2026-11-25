CREATE TABLE "monthly_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"portion" text,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dealer_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"delivery_day" integer NOT NULL,
	"address" text NOT NULL,
	"pincode" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_cycle" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_plans_dealer_customer_unique" UNIQUE("dealer_id","customer_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "monthly_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "monthly_cycle" text;--> statement-breakpoint
ALTER TABLE "monthly_plan_items" ADD CONSTRAINT "monthly_plan_items_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plan_items" ADD CONSTRAINT "monthly_plan_items_plan_id_monthly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."monthly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plan_items" ADD CONSTRAINT "monthly_plan_items_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD CONSTRAINT "monthly_plans_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_plans" ADD CONSTRAINT "monthly_plans_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_plan_items_plan_idx" ON "monthly_plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "monthly_plans_dealer_status_idx" ON "monthly_plans" USING btree ("dealer_id","status");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_monthly_plan_id_monthly_plans_id_fk" FOREIGN KEY ("monthly_plan_id") REFERENCES "public"."monthly_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_monthly_cycle_unique" UNIQUE("monthly_plan_id","monthly_cycle");