CREATE TABLE "user_product_phones" (
	"user_id" text NOT NULL,
	"industry" "industry" NOT NULL,
	"phone" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_product_phones_user_id_industry_pk" PRIMARY KEY("user_id","industry"),
	CONSTRAINT "user_product_phones_phone_industry_unique" UNIQUE("phone","industry")
);
--> statement-breakpoint
ALTER TABLE "user_product_phones" ADD CONSTRAINT "user_product_phones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_product_phones_phone_idx" ON "user_product_phones" USING btree ("phone");