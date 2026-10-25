ALTER TYPE "public"."booking_status" ADD VALUE 'refund_pending';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_status" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_error" text;--> statement-breakpoint
-- Refuse to continue, with a clear message, if the old race already produced two paid bookings for one car. Refund the extra
-- one(s) (set status to 'refunded' after refunding in Razorpay), then run the migration again. Nothing above is committed on failure.
DO $$
DECLARE dupes integer;
BEGIN
  SELECT count(*) INTO dupes FROM (SELECT car_id FROM "bookings" WHERE "status" = 'paid' GROUP BY car_id HAVING count(*) > 1) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'bookings_one_paid_per_car_uq: % car(s) have more than one paid booking. Resolve them first: SELECT car_id, array_agg(id) FROM bookings WHERE status = ''paid'' GROUP BY car_id HAVING count(*) > 1', dupes;
  END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_one_paid_per_car_uq" ON "bookings" USING btree ("car_id") WHERE "bookings"."status" = 'paid';