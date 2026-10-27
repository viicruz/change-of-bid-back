//* Libraries imports
import { and, asc, eq, sql } from "drizzle-orm";

//* Schemas imports
import type { ShowAuctioneerLotStatus } from "../../schemas/show-auctioneer-lot";

//* Local imports
import { db } from "../../db/index";
import {
  bid,
  lot,
  lotItem,
  lotParticipant,
  wallet,
  walletMovement,
} from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import {
  isCanceled,
  isEnded,
  isLive,
  isScheduled,
} from "./effective-lot-status";

const showAuctioneerLotErrorCodes = [
  "NOT_AUCTIONEER",
  "LOT_NOT_OWNED",
  "LOT_NOT_FOUND",
] as const;

export type ShowAuctioneerLotErrorCode =
  (typeof showAuctioneerLotErrorCodes)[number];

export class ShowAuctioneerLotError extends Error {
  readonly code: ShowAuctioneerLotErrorCode;

  constructor(code: ShowAuctioneerLotErrorCode, message: string) {
    super(message);
    this.name = "ShowAuctioneerLotError";
    this.code = code;
  }
}

export type ShowAuctioneerLotInput = {
  lotId: string;
  auctioneerId: string;
  role: string;
};

export type ShownAuctioneerLotItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
  cardSnapshot: Record<string, unknown>;
};

export type ShownAuctioneerLotBid = {
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
};

export type ShownAuctioneerLot = {
  serverNow: Date;
  lot: {
    id: string;
    title: string;
    description: string | null;
    openingBid: string;
    minIncrement: string;
    startsAt: Date;
    endsAt: Date;
    extensionCount: number;
    status: ShowAuctioneerLotStatus;
    currentBid: string | null;
    leaderParticipantNo: number | null;
    bidCount: number;
    sold: boolean;
    winnerParticipantNo: number | null;
    receivedAmount: string | null;
    items: ShownAuctioneerLotItem[];
    bids: ShownAuctioneerLotBid[];
  };
};

export type ShowAuctioneerLotDependencies = {
  now: () => Date;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
};

export function runShowAuctioneerLotRead<Result>(
  work: (executor: DatabaseExecutor) => Promise<Result>,
): Promise<Result> {
  return db.transaction((executor) => work(executor), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

type StoredBid = ShownAuctioneerLotBid & {
  id: string;
  userId: string;
};

export async function showAuctioneerLot(
  input: ShowAuctioneerLotInput,
  dependencies: Partial<ShowAuctioneerLotDependencies> = {},
): Promise<ShownAuctioneerLot> {
  if (input.role !== "AUCTIONEER") {
    throw new ShowAuctioneerLotError(
      "NOT_AUCTIONEER",
      "Only an auctioneer can view their lot.",
    );
  }

  const resolved: ShowAuctioneerLotDependencies = {
    ...createDefaultDependencies(),
    ...dependencies,
  };
  const now = resolved.now();

  return resolved.runInTransaction(async (executor) => {
    const row = await findLot(executor, input.lotId, now);

    if (row === null) {
      throw new ShowAuctioneerLotError("LOT_NOT_FOUND", "Lot was not found.");
    }

    if (row.auctioneerId !== input.auctioneerId) {
      throw new ShowAuctioneerLotError(
        "LOT_NOT_OWNED",
        "Only the owner can view this lot.",
      );
    }

    const items = await loadItems(executor, input.lotId);
    const bids = await loadBids(executor, input.lotId);
    const receivedAmount = await loadReceivedAmount(
      executor,
      input.lotId,
      input.auctioneerId,
    );
    const leader = bids.find((entry) => entry.id === row.currentBidId);
    const winner =
      row.winnerId === null
        ? undefined
        : bids.find((entry) => entry.userId === row.winnerId);

    return {
      serverNow: now,
      lot: {
        id: row.id,
        title: row.title,
        description: row.description,
        openingBid: row.openingBid,
        minIncrement: row.minIncrement,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        extensionCount: row.extensionCount,
        status: requireStatus(row.status),
        currentBid: row.currentBid,
        leaderParticipantNo: leader?.participantNo ?? null,
        bidCount: row.bidCount,
        sold: row.winnerId !== null,
        winnerParticipantNo: winner?.participantNo ?? null,
        receivedAmount,
        items: items.map((item) => ({
          ...item,
          cardSnapshot: publicCardSnapshot(item.cardSnapshot),
        })),
        bids: bids.map((entry) => ({
          sequence: entry.sequence,
          amount: entry.amount,
          createdAt: entry.createdAt,
          participantNo: entry.participantNo,
        })),
      },
    };
  });
}

function createDefaultDependencies(): ShowAuctioneerLotDependencies {
  return {
    now: () => new Date(),
    runInTransaction: runShowAuctioneerLotRead,
  };
}

function publicCardSnapshot(snapshot: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== "card_images"),
  );
}

async function findLot(
  executor: DatabaseExecutor,
  lotId: string,
  now: Date,
) {
  const rows = await executor
    .select({
      id: lot.id,
      auctioneerId: lot.auctioneerId,
      title: lot.title,
      description: lot.description,
      openingBid: lot.openingBid,
      minIncrement: lot.minIncrement,
      startsAt: lot.startsAt,
      endsAt: lot.endsAt,
      extensionCount: lot.extensionCount,
      status: sql<string | null>`CASE
        WHEN ${isCanceled()} THEN 'CANCELED'
        WHEN ${isEnded(now)} THEN 'ENDED'
        WHEN ${isScheduled(now)} THEN 'SCHEDULED'
        WHEN ${isLive(now)} THEN 'LIVE'
      END`.as("effective_status"),
      currentBidId: lot.currentBidId,
      currentBid: bid.amount,
      bidCount: lot.bidCount,
      winnerId: lot.winnerId,
    })
    .from(lot)
    .leftJoin(bid, eq(bid.id, lot.currentBidId))
    .where(eq(lot.id, lotId));

  return rows[0] ?? null;
}

async function loadItems(executor: DatabaseExecutor, lotId: string) {
  return executor
    .select({
      id: lotItem.id,
      position: lotItem.position,
      cardId: lotItem.cardId,
      quantity: lotItem.quantity,
      cardName: lotItem.cardName,
      imagePath: lotItem.imagePath,
      cardSnapshot: lotItem.cardSnapshot,
    })
    .from(lotItem)
    .where(eq(lotItem.lotId, lotId))
    .orderBy(asc(lotItem.position));
}

async function loadReceivedAmount(
  executor: DatabaseExecutor,
  lotId: string,
  auctioneerId: string,
) {
  const rows = await executor
    .select({
      amount: walletMovement.amount,
    })
    .from(walletMovement)
    .innerJoin(wallet, eq(wallet.id, walletMovement.walletId))
    .where(
      and(
        eq(walletMovement.lotId, lotId),
        eq(walletMovement.type, "SETTLEMENT_CREDIT"),
        eq(wallet.userId, auctioneerId),
      ),
    );
  const amount = rows[0]?.amount;

  if (amount === undefined) {
    return null;
  }

  return formatShownMoney(amount);
}

async function loadBids(
  executor: DatabaseExecutor,
  lotId: string,
): Promise<StoredBid[]> {
  return executor
    .select({
      id: bid.id,
      userId: lotParticipant.userId,
      sequence: bid.sequence,
      amount: bid.amount,
      createdAt: bid.createdAt,
      participantNo: lotParticipant.participantNo,
    })
    .from(bid)
    .innerJoin(lotParticipant, eq(lotParticipant.id, bid.participantId))
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));
}

function requireStatus(status: string | null): ShowAuctioneerLotStatus {
  if (
    status === "SCHEDULED" ||
    status === "LIVE" ||
    status === "ENDED" ||
    status === "CANCELED"
  ) {
    return status;
  }

  throw new Error("Lot show returned an unexpected status");
}

function formatShownMoney(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (match === null) {
    throw new Error("Lot show returned an unexpected amount");
  }

  const fraction = match[3] ?? "";

  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error("Lot show returned an unexpected amount");
  }

  return `${match[1]}${match[2]}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
