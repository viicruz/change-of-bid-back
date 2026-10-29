import { asc, eq } from "drizzle-orm";
import { db } from "../../db/index";
import { bid, lot, lotItem, lotParticipant } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import type { ShowPublicLotStatus } from "../../schemas/show-lot";
import { effectiveLotStatus } from "./effective-lot-status";

export const lotItemColumns = {
  id: lotItem.id,
  position: lotItem.position,
  cardId: lotItem.cardId,
  quantity: lotItem.quantity,
  cardName: lotItem.cardName,
  imagePath: lotItem.imagePath,
};

export function lotListColumns(now: Date) {
  return {
    id: lot.id,
    title: lot.title,
    description: lot.description,
    openingBid: lot.openingBid,
    minIncrement: lot.minIncrement,
    startsAt: lot.startsAt,
    endsAt: lot.endsAt,
    status: effectiveLotStatus(now),
    currentBid: bid.amount,
    bidCount: lot.bidCount,
    winnerId: lot.winnerId,
  };
}

export function runLotRead<Result>(
  work: (executor: DatabaseExecutor) => Promise<Result>,
): Promise<Result> {
  return db.transaction((executor) => work(executor), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export function requireLotStatus(
  status: string | null,
  context = "Lot show",
): ShowPublicLotStatus {
  if (
    status === "SCHEDULED" ||
    status === "LIVE" ||
    status === "ENDED" ||
    status === "CANCELED"
  ) {
    return status;
  }
  throw new Error(`${context} returned an unexpected status`);
}

export async function findShownLot(
  executor: DatabaseExecutor,
  lotId: string,
  now: Date,
) {
  const rows = await executor
    .select({
      ...lotListColumns(now),
      auctioneerId: lot.auctioneerId,
      extensionCount: lot.extensionCount,
      currentBidId: lot.currentBidId,
    })
    .from(lot)
    .leftJoin(bid, eq(bid.id, lot.currentBidId))
    .where(eq(lot.id, lotId));

  return rows[0] ?? null;
}

export async function loadShownLotItems(
  executor: DatabaseExecutor,
  lotId: string,
) {
  return executor
    .select({
      ...lotItemColumns,
      cardSnapshot: lotItem.cardSnapshot,
    })
    .from(lotItem)
    .where(eq(lotItem.lotId, lotId))
    .orderBy(asc(lotItem.position));
}

export async function loadShownLotBids(
  executor: DatabaseExecutor,
  lotId: string,
) {
  return executor
    .select({
      id: bid.id,
      userId: lotParticipant.userId,
      previousHash: bid.previousHash,
      hash: bid.hash,
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

export function publicCardSnapshot(snapshot: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== "card_images"),
  );
}

// Explicit projection keeps owner IDs, bidder IDs and hashes out of responses.
export function presentShownLot(
  row: NonNullable<Awaited<ReturnType<typeof findShownLot>>>,
  items: Awaited<ReturnType<typeof loadShownLotItems>>,
  bids: Awaited<ReturnType<typeof loadShownLotBids>>,
) {
  const leader = bids.find((entry) => entry.id === row.currentBidId);
  const winner =
    row.winnerId === null
      ? undefined
      : bids.find((entry) => entry.userId === row.winnerId);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    openingBid: row.openingBid,
    minIncrement: row.minIncrement,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    extensionCount: row.extensionCount,
    status: requireLotStatus(row.status),
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
  };
}
