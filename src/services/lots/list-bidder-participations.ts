//* Libraries imports
import { asc, eq, inArray, sql } from "drizzle-orm";

//* Schemas imports
import type { BidderParticipationStatus } from "../../schemas/list-bidder-participations";

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

const listBidderParticipationsErrorCodes = ["NOT_BIDDER"] as const;

export type ListBidderParticipationsErrorCode =
  (typeof listBidderParticipationsErrorCodes)[number];

export class ListBidderParticipationsError extends Error {
  readonly code: ListBidderParticipationsErrorCode;

  constructor(code: ListBidderParticipationsErrorCode, message: string) {
    super(message);
    this.name = "ListBidderParticipationsError";
    this.code = code;
  }
}

export type ListBidderParticipationsInput = {
  userId: string;
  role: string;
};

export type BidderParticipationItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
};

export type BidderParticipation = {
  id: string;
  title: string;
  description: string | null;
  openingBid: string;
  minIncrement: string;
  startsAt: Date;
  endsAt: Date;
  status: BidderParticipationStatus;
  currentBid: string | null;
  bidCount: number;
  participantNo: number;
  won: boolean;
  items: BidderParticipationItem[];
};

export type BidderParticipationList = {
  lots: BidderParticipation[];
};

export type ListBidderParticipationsDependencies = {
  now: () => Date;
  executor: DatabaseExecutor;
};

export async function listBidderParticipations(
  input: ListBidderParticipationsInput,
  dependencies: ListBidderParticipationsDependencies = createDefaultDependencies(),
): Promise<BidderParticipationList> {
  if (input.role !== "BIDDER") {
    throw new ListBidderParticipationsError(
      "NOT_BIDDER",
      "Only a bidder can list their participations.",
    );
  }

  const now = dependencies.now();
  const rows = await dependencies.executor
    .select({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      openingBid: lot.openingBid,
      minIncrement: lot.minIncrement,
      startsAt: lot.startsAt,
      endsAt: lot.endsAt,
      status: sql<string | null>`CASE
        WHEN ${isCanceled()} THEN 'CANCELED'
        WHEN ${isEnded(now)} THEN 'ENDED'
        WHEN ${isScheduled(now)} THEN 'SCHEDULED'
        WHEN ${isLive(now)} THEN 'LIVE'
      END`.as("effective_status"),
      currentBid: bid.amount,
      bidCount: lot.bidCount,
      participantNo: lotParticipant.participantNo,
      winnerId: lot.winnerId,
    })
    .from(lotParticipant)
    .innerJoin(lot, eq(lot.id, lotParticipant.lotId))
    .leftJoin(bid, eq(bid.id, lot.currentBidId))
    .where(eq(lotParticipant.userId, input.userId))
    .orderBy(
      sql`CASE
        WHEN ${isLive(now)} THEN 0
        WHEN ${isScheduled(now)} THEN 1
        WHEN ${isEnded(now)} THEN 2
        ELSE 3
      END`,
      sql`CASE WHEN ${isEnded(now)} THEN ${lot.endsAt} END DESC`,
      sql`CASE WHEN ${isScheduled(now)} THEN ${lot.startsAt} END ASC`,
      sql`CASE WHEN ${isLive(now)} THEN ${lot.endsAt} END ASC`,
      sql`CASE WHEN ${isCanceled()} THEN ${lot.canceledAt} END DESC`,
      asc(lot.id),
    );

  const itemsByLotId = await loadItems(
    dependencies.executor,
    rows.map((row) => row.id),
  );

  return {
    lots: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      openingBid: formatListedMoney(row.openingBid),
      minIncrement: formatListedMoney(row.minIncrement),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: requireStatus(row.status),
      currentBid:
        row.currentBid === null ? null : formatListedMoney(row.currentBid),
      bidCount: row.bidCount,
      participantNo: row.participantNo,
      won: row.winnerId === input.userId,
      items: itemsByLotId.get(row.id) ?? [],
    })),
  };
}

function createDefaultDependencies(): ListBidderParticipationsDependencies {
  return {
    now: () => new Date(),
    executor: db,
  };
}

async function loadItems(executor: DatabaseExecutor, lotIds: string[]) {
  const itemsByLotId = new Map<string, BidderParticipationItem[]>();

  if (lotIds.length === 0) {
    return itemsByLotId;
  }

  const items = await executor
    .select({
      id: lotItem.id,
      lotId: lotItem.lotId,
      position: lotItem.position,
      cardId: lotItem.cardId,
      quantity: lotItem.quantity,
      cardName: lotItem.cardName,
      imagePath: lotItem.imagePath,
    })
    .from(lotItem)
    .where(inArray(lotItem.lotId, lotIds))
    .orderBy(asc(lotItem.lotId), asc(lotItem.position));

  for (const item of items) {
    const grouped = itemsByLotId.get(item.lotId) ?? [];

    grouped.push({
      id: item.id,
      position: item.position,
      cardId: item.cardId,
      quantity: item.quantity,
      cardName: item.cardName,
      imagePath: item.imagePath,
    });
    itemsByLotId.set(item.lotId, grouped);
  }

  return itemsByLotId;
}

function requireStatus(status: string | null): BidderParticipationStatus {
  if (
    status === "SCHEDULED" ||
    status === "LIVE" ||
    status === "ENDED" ||
    status === "CANCELED"
  ) {
    return status;
  }

  throw new Error("Participation listing returned an unexpected status");
}

function formatListedMoney(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (match === null) {
    throw new Error("Participation listing returned an unexpected amount");
  }

  const fraction = match[3] ?? "";

  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error("Participation listing returned an unexpected amount");
  }

  return `${match[1]}${match[2]}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
