-- dealers.industry: free text -> enum. Existing rows hold only 'motors' or 'restaurants' (checked 2026-10-21).
-- Future verticals add a value with ALTER TYPE "industry" ADD VALUE '...' in their own migration.
CREATE TYPE "public"."industry" AS ENUM('motors', 'restaurants', 'cabs');--> statement-breakpoint
ALTER TABLE "dealers" ALTER COLUMN "industry" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "dealers" ALTER COLUMN "industry" SET DATA TYPE "public"."industry" USING "industry"::"public"."industry";--> statement-breakpoint
ALTER TABLE "dealers" ALTER COLUMN "industry" SET DEFAULT 'motors'::"public"."industry";
