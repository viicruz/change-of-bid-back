CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "lot_status" AS ENUM('ACTIVE', 'ENDED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('BIDDER', 'AUCTIONEER');--> statement-breakpoint
CREATE TYPE "wallet_movement_type" AS ENUM('DEPOSIT', 'HOLD', 'RELEASE', 'SETTLEMENT_DEBIT', 'SETTLEMENT_CREDIT');--> statement-breakpoint
CREATE TABLE "bid" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"lot_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"bidder_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"amount" numeric(18,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"previous_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "bid_lot_id_sequence_unique" UNIQUE("lot_id","sequence"),
	CONSTRAINT "bid_amount_positive_check" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "card" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"frame_type" text NOT NULL,
	"description" text,
	"race" text,
	"attribute" text,
	"atk" integer,
	"def" integer,
	"level" integer,
	"raw" jsonb NOT NULL,
	"image_path" text,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"auctioneer_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"opening_bid" numeric(18,2) NOT NULL,
	"min_increment" numeric(18,2) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"original_ends_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"extension_count" integer DEFAULT 0 NOT NULL,
	"status" "lot_status" DEFAULT 'ACTIVE'::"lot_status" NOT NULL,
	"current_bid_id" uuid,
	"winner_id" text,
	"bid_count" integer DEFAULT 0 NOT NULL,
	"head_hash" text,
	"ended_at" timestamp with time zone,
	"settled_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_opening_bid_positive_check" CHECK ("opening_bid" > 0),
	CONSTRAINT "lot_min_increment_positive_check" CHECK ("min_increment" > 0),
	CONSTRAINT "lot_schedule_check" CHECK ("starts_at" < "original_ends_at" AND "ends_at" >= "original_ends_at"),
	CONSTRAINT "lot_canceled_check" CHECK ("status" <> 'CANCELED' OR ("canceled_at" IS NOT NULL AND "winner_id" IS NULL)),
	CONSTRAINT "lot_ended_check" CHECK ("status" <> 'ENDED' OR "ended_at" IS NOT NULL),
	CONSTRAINT "lot_winner_check" CHECK ("winner_id" IS NULL OR "status" = 'ENDED')
);
--> statement-breakpoint
CREATE TABLE "lot_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"lot_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"card_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"card_name" text NOT NULL,
	"card_snapshot" jsonb NOT NULL,
	"image_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_item_lot_id_position_unique" UNIQUE("lot_id","position"),
	CONSTRAINT "lot_item_quantity_positive_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "lot_participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"lot_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"participant_no" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_participant_lot_id_user_id_unique" UNIQUE("lot_id","user_id"),
	CONSTRAINT "lot_participant_lot_id_participant_no_unique" UNIQUE("lot_id","participant_no")
);
--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"lot_id" uuid NOT NULL UNIQUE,
	"winning_bid_id" uuid NOT NULL UNIQUE,
	"winner_id" text NOT NULL,
	"winner_participant_no" integer NOT NULL,
	"final_amount" numeric(18,2) NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"share_token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL UNIQUE,
	"total_balance" numeric(18,2) DEFAULT '0' NOT NULL,
	"committed_balance" numeric(18,2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_committed_balance_check" CHECK ("committed_balance" >= 0 AND "committed_balance" <= "total_balance")
);
--> statement-breakpoint
CREATE TABLE "wallet_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"wallet_id" uuid NOT NULL,
	"type" "wallet_movement_type" NOT NULL,
	"amount" numeric(18,2) NOT NULL,
	"lot_id" uuid,
	"bid_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_movement_amount_positive_check" CHECK ("amount" > 0),
	CONSTRAINT "wallet_movement_lot_id_check" CHECK (("type" = 'DEPOSIT' AND "lot_id" IS NULL) OR ("type" <> 'DEPOSIT' AND "lot_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'BIDDER'::"user_role" NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "access_token_expires_at" SET DATA TYPE timestamp with time zone USING "access_token_expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "refresh_token_expires_at" SET DATA TYPE timestamp with time zone USING "refresh_token_expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone USING "updated_at"::timestamp with time zone;--> statement-breakpoint
CREATE INDEX "bid_bidder_id_idx" ON "bid" ("bidder_id");--> statement-breakpoint
CREATE INDEX "lot_status_ends_at_idx" ON "lot" ("status","ends_at");--> statement-breakpoint
CREATE INDEX "lot_status_starts_at_idx" ON "lot" ("status","starts_at");--> statement-breakpoint
CREATE INDEX "lot_auctioneer_id_idx" ON "lot" ("auctioneer_id");--> statement-breakpoint
CREATE INDEX "lot_title_trgm_idx" ON "lot" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "lot_item_lot_id_idx" ON "lot_item" ("lot_id");--> statement-breakpoint
CREATE INDEX "lot_item_card_id_idx" ON "lot_item" ("card_id");--> statement-breakpoint
CREATE INDEX "lot_item_card_name_trgm_idx" ON "lot_item" USING gin ("card_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "lot_participant_user_id_idx" ON "lot_participant" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_movement_bid_id_type_hold_release_key" ON "wallet_movement" ("bid_id","type") WHERE "type" IN ('HOLD', 'RELEASE');--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_movement_lot_id_type_settlement_key" ON "wallet_movement" ("lot_id","type") WHERE "type" IN ('SETTLEMENT_DEBIT', 'SETTLEMENT_CREDIT');--> statement-breakpoint
CREATE INDEX "wallet_movement_wallet_id_created_at_idx" ON "wallet_movement" ("wallet_id","created_at");--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_lot_id_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id");--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_participant_id_lot_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "lot_participant"("id");--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_bidder_id_user_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_auctioneer_id_user_id_fkey" FOREIGN KEY ("auctioneer_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_current_bid_id_bid_id_fkey" FOREIGN KEY ("current_bid_id") REFERENCES "bid"("id");--> statement-breakpoint
ALTER TABLE "lot" ADD CONSTRAINT "lot_winner_id_user_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "lot_item" ADD CONSTRAINT "lot_item_lot_id_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id");--> statement-breakpoint
ALTER TABLE "lot_item" ADD CONSTRAINT "lot_item_card_id_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id");--> statement-breakpoint
ALTER TABLE "lot_participant" ADD CONSTRAINT "lot_participant_lot_id_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id");--> statement-breakpoint
ALTER TABLE "lot_participant" ADD CONSTRAINT "lot_participant_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_lot_id_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id");--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_winning_bid_id_bid_id_fkey" FOREIGN KEY ("winning_bid_id") REFERENCES "bid"("id");--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_winner_id_user_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "wallet_movement" ADD CONSTRAINT "wallet_movement_wallet_id_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallet"("id");--> statement-breakpoint
ALTER TABLE "wallet_movement" ADD CONSTRAINT "wallet_movement_lot_id_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id");--> statement-breakpoint
ALTER TABLE "wallet_movement" ADD CONSTRAINT "wallet_movement_bid_id_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bid"("id");