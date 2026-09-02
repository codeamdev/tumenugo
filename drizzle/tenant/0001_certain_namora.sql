ALTER TYPE "public"."order_type" ADD VALUE 'takeout';--> statement-breakpoint
ALTER TABLE "cash_register_entries" ALTER COLUMN "payment_method" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "payment_method" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."payment_method";