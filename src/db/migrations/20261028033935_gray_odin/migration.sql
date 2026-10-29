ALTER TABLE "bid" ADD CONSTRAINT "bid_amount_limit_check" CHECK ("amount" <= 1000000.00);--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_opening_bid_limit_check" CHECK ("opening_bid" <= 1000000.00);--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_min_increment_limit_check" CHECK ("min_increment" <= 1000000.00);--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_final_amount_positive_check" CHECK ("final_amount" > 0);--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_final_amount_limit_check" CHECK ("final_amount" <= 1000000.00);--> statement-breakpoint
ALTER TABLE "wallet_movement" ADD CONSTRAINT "wallet_movement_amount_limit_check" CHECK ("amount" <= 1000000.00);