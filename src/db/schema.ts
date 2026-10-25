//* Libraries imports
import { defineRelationsPart, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true });
}

function money(name: string) {
  return numeric(name, { precision: 18, scale: 2, mode: "string" });
}

function createdAt() {
  return {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
  };
}

function timestamps() {
  return {
    ...createdAt(),
    updatedAt: timestamptz("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  };
}

//* Enums
export const userRoleEnum = pgEnum("user_role", ["BIDDER", "AUCTIONEER"]);

export const walletMovementTypeEnum = pgEnum("wallet_movement_type", [
  "DEPOSIT",
  "HOLD",
  "RELEASE",
  "SETTLEMENT_DEBIT",
  "SETTLEMENT_CREDIT",
]);

export const lotStatusEnum = pgEnum("lot_status", [
  "ACTIVE",
  "ENDED",
  "CANCELED",
  "SCHEDULED",
]);

//* Auth
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: userRoleEnum("role").default("BIDDER").notNull(),
  ...timestamps(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamptz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ...timestamps(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    ...timestamps(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

//* Wallet
export const wallet = pgTable(
  "wallet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id),
    totalBalance: money("total_balance").default("0").notNull(),
    committedBalance: money("committed_balance").default("0").notNull(),
    ...timestamps(),
  },
  (table) => [
    check(
      "wallet_committed_balance_check",
      sql`${table.committedBalance} >= 0 AND ${table.committedBalance} <= ${table.totalBalance}`,
    ),
  ],
);

//* Catalog
export const card = pgTable("card", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  frameType: text("frame_type").notNull(),
  description: text("description"),
  race: text("race"),
  attribute: text("attribute"),
  atk: integer("atk"),
  def: integer("def"),
  level: integer("level"),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  imagePath: text("image_path"),
  fetchedAt: timestamptz("fetched_at").notNull(),
});

//* Auction
export const lot = pgTable(
  "lot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auctioneerId: text("auctioneer_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    description: text("description"),
    openingBid: money("opening_bid").notNull(),
    minIncrement: money("min_increment").notNull(),
    startsAt: timestamptz("starts_at").notNull(),
    originalEndsAt: timestamptz("original_ends_at").notNull(),
    endsAt: timestamptz("ends_at").notNull(),
    extensionCount: integer("extension_count").default(0).notNull(),
    status: lotStatusEnum("status").default("ACTIVE").notNull(),
    currentBidId: uuid("current_bid_id").references((): AnyPgColumn => bid.id),
    winnerId: text("winner_id").references(() => user.id),
    bidCount: integer("bid_count").default(0).notNull(),
    headHash: text("head_hash"),
    endedAt: timestamptz("ended_at"),
    settledAt: timestamptz("settled_at"),
    canceledAt: timestamptz("canceled_at"),
    ...timestamps(),
  },
  (table) => [
    check(
      "lot_opening_bid_positive_check",
      sql`${table.openingBid} > 0`,
    ),
    check(
      "lot_min_increment_positive_check",
      sql`${table.minIncrement} > 0`,
    ),
    check(
      "lot_schedule_check",
      sql`${table.startsAt} < ${table.originalEndsAt} AND ${table.endsAt} >= ${table.originalEndsAt}`,
    ),
    check(
      "lot_canceled_check",
      sql`${table.status} <> 'CANCELED' OR (${table.canceledAt} IS NOT NULL AND ${table.winnerId} IS NULL)`,
    ),
    check(
      "lot_ended_check",
      sql`${table.status} <> 'ENDED' OR ${table.endedAt} IS NOT NULL`,
    ),
    check(
      "lot_winner_check",
      sql`${table.winnerId} IS NULL OR ${table.status} = 'ENDED'`,
    ),
    index("lot_status_ends_at_idx").on(table.status, table.endsAt),
    index("lot_status_starts_at_idx").on(table.status, table.startsAt),
    index("lot_auctioneer_id_idx").on(table.auctioneerId),
    index("lot_title_trgm_idx").using("gin", table.title.op("gin_trgm_ops")),
  ],
);

export const lotItem = pgTable(
  "lot_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lot.id),
    position: integer("position").notNull(),
    cardId: integer("card_id")
      .notNull()
      .references(() => card.id),
    quantity: integer("quantity").default(1).notNull(),
    cardName: text("card_name").notNull(),
    cardSnapshot: jsonb("card_snapshot").$type<Record<string, unknown>>().notNull(),
    imagePath: text("image_path").notNull(),
    ...createdAt(),
  },
  (table) => [
    unique("lot_item_lot_id_position_unique").on(table.lotId, table.position),
    check("lot_item_quantity_positive_check", sql`${table.quantity} > 0`),
    index("lot_item_lot_id_idx").on(table.lotId),
    index("lot_item_card_id_idx").on(table.cardId),
    index("lot_item_card_name_trgm_idx").using(
      "gin",
      table.cardName.op("gin_trgm_ops"),
    ),
  ],
);

export const lotParticipant = pgTable(
  "lot_participant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lot.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    participantNo: integer("participant_no").notNull(),
    ...createdAt(),
  },
  (table) => [
    unique("lot_participant_lot_id_user_id_unique").on(table.lotId, table.userId),
    unique("lot_participant_lot_id_participant_no_unique").on(
      table.lotId,
      table.participantNo,
    ),
    index("lot_participant_user_id_idx").on(table.userId),
  ],
);

export const bid = pgTable(
  "bid",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lot.id),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => lotParticipant.id),
    bidderId: text("bidder_id")
      .notNull()
      .references(() => user.id),
    sequence: integer("sequence").notNull(),
    amount: money("amount").notNull(),
    createdAt: timestamptz("created_at").default(sql`clock_timestamp()`).notNull(),
    previousHash: text("previous_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (table) => [
    unique("bid_lot_id_sequence_unique").on(table.lotId, table.sequence),
    check("bid_amount_positive_check", sql`${table.amount} > 0`),
    index("bid_bidder_id_idx").on(table.bidderId),
  ],
);

export const walletMovement = pgTable(
  "wallet_movement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallet.id),
    type: walletMovementTypeEnum("type").notNull(),
    amount: money("amount").notNull(),
    lotId: uuid("lot_id").references(() => lot.id),
    bidId: uuid("bid_id").references(() => bid.id),
    ...createdAt(),
  },
  (table) => [
    check("wallet_movement_amount_positive_check", sql`${table.amount} > 0`),
    check(
      "wallet_movement_lot_id_check",
      sql`(${table.type} = 'DEPOSIT' AND ${table.lotId} IS NULL) OR (${table.type} <> 'DEPOSIT' AND ${table.lotId} IS NOT NULL)`,
    ),
    check(
      "wallet_movement_bid_id_check",
      sql`${table.type} NOT IN ('HOLD', 'RELEASE') OR ${table.bidId} IS NOT NULL`,
    ),
    uniqueIndex("wallet_movement_bid_id_type_hold_release_key")
      .on(table.bidId, table.type)
      .where(sql`${table.type} IN ('HOLD', 'RELEASE')`),
    uniqueIndex("wallet_movement_lot_id_type_settlement_key")
      .on(table.lotId, table.type)
      .where(sql`${table.type} IN ('SETTLEMENT_DEBIT', 'SETTLEMENT_CREDIT')`),
    index("wallet_movement_wallet_id_created_at_idx").on(
      table.walletId,
      table.createdAt,
    ),
  ],
);

export const receipt = pgTable("receipt", {
  id: uuid("id").primaryKey().defaultRandom(),
  lotId: uuid("lot_id")
    .notNull()
    .unique()
    .references(() => lot.id),
  winningBidId: uuid("winning_bid_id")
    .notNull()
    .unique()
    .references(() => bid.id),
  winnerId: text("winner_id")
    .notNull()
    .references(() => user.id),
  winnerParticipantNo: integer("winner_participant_no").notNull(),
  finalAmount: money("final_amount").notNull(),
  endedAt: timestamptz("ended_at").notNull(),
  shareToken: text("share_token").notNull().unique(),
  ...createdAt(),
});

//* Relations
export const relations = defineRelationsPart(
  {
    user,
    session,
    account,
    verification,
    wallet,
    walletMovement,
    card,
    lot,
    lotItem,
    lotParticipant,
    bid,
    receipt,
  },
  (r) => ({
    user: {
      sessions: r.many.session({
        from: r.user.id,
        to: r.session.userId,
      }),
      accounts: r.many.account({
        from: r.user.id,
        to: r.account.userId,
      }),
      wallet: r.one.wallet({
        from: r.user.id,
        to: r.wallet.userId,
      }),
      auctionedLots: r.many.lot({
        from: r.user.id,
        to: r.lot.auctioneerId,
      }),
      wonLots: r.many.lot({
        from: r.user.id,
        to: r.lot.winnerId,
      }),
      participations: r.many.lotParticipant({
        from: r.user.id,
        to: r.lotParticipant.userId,
      }),
      bids: r.many.bid({
        from: r.user.id,
        to: r.bid.bidderId,
      }),
      receipts: r.many.receipt({
        from: r.user.id,
        to: r.receipt.winnerId,
      }),
    },
    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
        optional: false,
      }),
    },
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
        optional: false,
      }),
    },
    wallet: {
      user: r.one.user({
        from: r.wallet.userId,
        to: r.user.id,
        optional: false,
      }),
      movements: r.many.walletMovement({
        from: r.wallet.id,
        to: r.walletMovement.walletId,
      }),
    },
    walletMovement: {
      wallet: r.one.wallet({
        from: r.walletMovement.walletId,
        to: r.wallet.id,
        optional: false,
      }),
      lot: r.one.lot({
        from: r.walletMovement.lotId,
        to: r.lot.id,
      }),
      bid: r.one.bid({
        from: r.walletMovement.bidId,
        to: r.bid.id,
      }),
    },
    card: {
      lotItems: r.many.lotItem({
        from: r.card.id,
        to: r.lotItem.cardId,
      }),
    },
    lot: {
      auctioneer: r.one.user({
        from: r.lot.auctioneerId,
        to: r.user.id,
        optional: false,
      }),
      winner: r.one.user({
        from: r.lot.winnerId,
        to: r.user.id,
      }),
      items: r.many.lotItem({
        from: r.lot.id,
        to: r.lotItem.lotId,
      }),
      participants: r.many.lotParticipant({
        from: r.lot.id,
        to: r.lotParticipant.lotId,
      }),
      bids: r.many.bid({
        from: r.lot.id,
        to: r.bid.lotId,
      }),
      currentBid: r.one.bid({
        from: r.lot.currentBidId,
        to: r.bid.id,
      }),
      movements: r.many.walletMovement({
        from: r.lot.id,
        to: r.walletMovement.lotId,
      }),
      receipt: r.one.receipt({
        from: r.lot.id,
        to: r.receipt.lotId,
      }),
    },
    lotItem: {
      lot: r.one.lot({
        from: r.lotItem.lotId,
        to: r.lot.id,
        optional: false,
      }),
      card: r.one.card({
        from: r.lotItem.cardId,
        to: r.card.id,
        optional: false,
      }),
    },
    lotParticipant: {
      lot: r.one.lot({
        from: r.lotParticipant.lotId,
        to: r.lot.id,
        optional: false,
      }),
      user: r.one.user({
        from: r.lotParticipant.userId,
        to: r.user.id,
        optional: false,
      }),
      bids: r.many.bid({
        from: r.lotParticipant.id,
        to: r.bid.participantId,
      }),
    },
    bid: {
      lot: r.one.lot({
        from: r.bid.lotId,
        to: r.lot.id,
        optional: false,
      }),
      participant: r.one.lotParticipant({
        from: r.bid.participantId,
        to: r.lotParticipant.id,
        optional: false,
      }),
      bidder: r.one.user({
        from: r.bid.bidderId,
        to: r.user.id,
        optional: false,
      }),
      movements: r.many.walletMovement({
        from: r.bid.id,
        to: r.walletMovement.bidId,
      }),
      receipt: r.one.receipt({
        from: r.bid.id,
        to: r.receipt.winningBidId,
      }),
    },
    receipt: {
      lot: r.one.lot({
        from: r.receipt.lotId,
        to: r.lot.id,
        optional: false,
      }),
      winningBid: r.one.bid({
        from: r.receipt.winningBidId,
        to: r.bid.id,
        optional: false,
      }),
      winner: r.one.user({
        from: r.receipt.winnerId,
        to: r.user.id,
        optional: false,
      }),
    },
  }),
);
