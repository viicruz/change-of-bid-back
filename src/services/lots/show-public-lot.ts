//* Libraries imports
import { and, asc, eq, sql } from "drizzle-orm";

//* Schemas imports
import type { ShowPublicLotStatus } from "../../schemas/show-lot";

//* Local imports
import { db } from "../../db/index";
import { bid, lot, lotItem, lotParticipant } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import {
  isCanceled,
  isEnded,
  isLive,
  isScheduled,
} from "./effective-lot-status";

const showPublicLotErrorCodes = ["LOT_NOT_FOUND"] as const;

export type ShowPublicLotErrorCode = (typeof showPublicLotErrorCodes)[number];

export class ShowPublicLotError extends Error {
  readonly code: ShowPublicLotErrorCode;

  constructor(code: ShowPublicLotErrorCode, message: string) {
    super(message);
    this.name = "ShowPublicLotError";
    this.code = code;
  }
}

export type ShownPublicLotItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
  cardSnapshot: Record<string, unknown>;
};

export type ShownPublicLotBid = {
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
};

export type ShownPublicLot = {
  serverNow: Date;
  viewerParticipantNo: number | null;
  lot: {
    id: string;
    title: string;
    description: string | null;
    openingBid: string;
    minIncrement: string;
    startsAt: Date;
    endsAt: Date;
    extensionCount: number;
    status: ShowPublicLotStatus;
    currentBid: string | null;
    leaderParticipantNo: number | null;
    bidCount: number;
    sold: boolean;
    winnerParticipantNo: number | null;
    items: ShownPublicLotItem[];
    bids: ShownPublicLotBid[];
  };
};

export type ShowPublicLotDependencies = {
  now: () => Date;
  viewerId: string | null;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
};

export function runShowPublicLotRead<Result>(
  work: (executor: DatabaseExecutor) => Promise<Result>,
): Promise<Result> {
  return db.transaction((executor) => work(executor), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

type StoredBid = ShownPublicLotBid & {
  id: string;
  userId: string;
};

export async function showPublicLot(
  lotId: string,
  dependencies: Partial<ShowPublicLotDependencies> = {},
): Promise<ShownPublicLot> {
  const resolved: ShowPublicLotDependencies = {
    ...createDefaultDependencies(),
    ...dependencies,
  };
  const now = resolved.now();

  return resolved.runInTransaction(async (executor) => {
    const row = await findLot(executor, lotId, now);

    if (row === null) {
      throw new ShowPublicLotError("LOT_NOT_FOUND", "Lot was not found.");
    }

    const items = await loadItems(executor, lotId);
    const bids = await loadBids(executor, lotId);
    const viewerParticipantNo = await findViewerParticipantNo(
      executor,
      lotId,
      resolved.viewerId,
    );
    const leader = bids.find((entry) => entry.id === row.currentBidId);
    const winner =
      row.winnerId === null
        ? undefined
        : bids.find((entry) => entry.userId === row.winnerId);

    return {
      serverNow: now,
      viewerParticipantNo,
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

function createDefaultDependencies(): ShowPublicLotDependencies {
  return {
    now: () => new Date(),
    viewerId: null,
    runInTransaction: runShowPublicLotRead,
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

async function findViewerParticipantNo(
  executor: DatabaseExecutor,
  lotId: string,
  viewerId: string | null,
) {
  if (viewerId === null) {
    return null;
  }

  const rows = await executor
    .select({ participantNo: lotParticipant.participantNo })
    .from(lotParticipant)
    .where(
      and(eq(lotParticipant.lotId, lotId), eq(lotParticipant.userId, viewerId)),
    );

  return rows[0]?.participantNo ?? null;
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

function requireStatus(status: string | null): ShowPublicLotStatus {
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
