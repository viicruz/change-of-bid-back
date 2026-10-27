//* Libraries imports
import { and, asc, eq, exists, inArray, or, sql } from "drizzle-orm";

//* Schemas imports
import type {
  AuctioneerLotStatus,
  ListAuctioneerLotsQuery,
} from "../../schemas/list-lots";

//* Local imports
import { db } from "../../db/index";
import { bid, lot, lotItem, wallet, walletMovement } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import {
  isCanceled,
  isEnded,
  isLive,
  isScheduled,
} from "./effective-lot-status";

const listAuctioneerLotsErrorCodes = ["NOT_AUCTIONEER"] as const;

export type ListAuctioneerLotsErrorCode =
  (typeof listAuctioneerLotsErrorCodes)[number];

export class ListAuctioneerLotsError extends Error {
  readonly code: ListAuctioneerLotsErrorCode;

  constructor(code: ListAuctioneerLotsErrorCode, message: string) {
    super(message);
    this.name = "ListAuctioneerLotsError";
    this.code = code;
  }
}

export type ListAuctioneerLotsInput = ListAuctioneerLotsQuery & {
  auctioneerId: string;
  role: string;
};

export type AuctioneerLotItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
};

export type AuctioneerLot = {
  id: string;
  title: string;
  description: string | null;
  openingBid: string;
  minIncrement: string;
  startsAt: Date;
  endsAt: Date;
  status: AuctioneerLotStatus;
  currentBid: string | null;
  bidCount: number;
  sold: boolean;
  receivedAmount: string | null;
  items: AuctioneerLotItem[];
};

export type AuctioneerLotList = {
  totalReceived: string;
  lots: AuctioneerLot[];
};

export type ListAuctioneerLotsDependencies = {
  now: () => Date;
  executor: DatabaseExecutor;
};

export async function listAuctioneerLots(
  input: ListAuctioneerLotsInput,
  dependencies: ListAuctioneerLotsDependencies = createDefaultDependencies(),
): Promise<AuctioneerLotList> {
  if (input.role !== "AUCTIONEER") {
    throw new ListAuctioneerLotsError(
      "NOT_AUCTIONEER",
      "Only an auctioneer can list their lots.",
    );
  }

  const now = dependencies.now();
  const totalReceived = await loadTotalReceived(
    dependencies.executor,
    input.auctioneerId,
  );
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
      winnerId: lot.winnerId,
      receivedAmount: sql<string | null>`(
        select ${walletMovement.amount}
        from ${walletMovement}
        inner join ${wallet}
          on ${wallet.id} = ${walletMovement.walletId}
        where ${walletMovement.lotId} = ${lot.id}
          and ${walletMovement.type} = 'SETTLEMENT_CREDIT'
          and ${wallet.userId} = ${input.auctioneerId}
      )`.as("received_amount"),
    })
    .from(lot)
    .leftJoin(bid, eq(bid.id, lot.currentBidId))
    .where(
      and(
        eq(lot.auctioneerId, input.auctioneerId),
        matchesStatus(input.status, now),
        matchesText(dependencies.executor, input.q),
      ),
    )
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
    totalReceived,
    lots: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      openingBid: row.openingBid,
      minIncrement: row.minIncrement,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: requireStatus(row.status),
      currentBid: row.currentBid,
      bidCount: row.bidCount,
      sold: row.winnerId !== null,
      receivedAmount:
        row.receivedAmount === null
          ? null
          : formatListedMoney(row.receivedAmount),
      items: itemsByLotId.get(row.id) ?? [],
    })),
  };
}

function createDefaultDependencies(): ListAuctioneerLotsDependencies {
  return {
    now: () => new Date(),
    executor: db,
  };
}

async function loadTotalReceived(
  executor: DatabaseExecutor,
  auctioneerId: string,
) {
  const rows = await executor
    .select({
      totalReceived: sql<string>`coalesce(sum(${walletMovement.amount}), 0)::numeric(18, 2)`,
    })
    .from(walletMovement)
    .innerJoin(wallet, eq(wallet.id, walletMovement.walletId))
    .where(
      and(
        eq(wallet.userId, auctioneerId),
        eq(walletMovement.type, "SETTLEMENT_CREDIT"),
      ),
    );

  return formatListedMoney(rows[0]?.totalReceived ?? "0");
}

function matchesStatus(status: AuctioneerLotStatus | undefined, now: Date) {
  if (status === "CANCELED") {
    return isCanceled();
  }

  if (status === "ENDED") {
    return isEnded(now);
  }

  if (status === "SCHEDULED") {
    return isScheduled(now);
  }

  if (status === "LIVE") {
    return isLive(now);
  }

  return undefined;
}

function matchesText(executor: DatabaseExecutor, q: string | undefined) {
  const term = q?.trim() ?? "";

  if (term.length === 0) {
    return undefined;
  }

  const pattern = `%${escapeLike(term)}%`;

  return or(
    sql`${lot.title} ILIKE ${pattern} ESCAPE '\\'`,
    exists(
      executor
        .select({ id: lotItem.id })
        .from(lotItem)
        .where(
          sql`${lotItem.lotId} = ${lot.id} AND ${lotItem.cardName} ILIKE ${pattern} ESCAPE '\\'`,
        ),
    ),
  );
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

async function loadItems(executor: DatabaseExecutor, lotIds: string[]) {
  const itemsByLotId = new Map<string, AuctioneerLotItem[]>();

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

function requireStatus(status: string | null): AuctioneerLotStatus {
  if (
    status === "SCHEDULED" ||
    status === "LIVE" ||
    status === "ENDED" ||
    status === "CANCELED"
  ) {
    return status;
  }

  throw new Error("Lot listing returned an unexpected status");
}

function formatListedMoney(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (match === null) {
    throw new Error("Lot listing returned an unexpected amount");
  }

  const fraction = match[3] ?? "";

  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error("Lot listing returned an unexpected amount");
  }

  return `${match[1]}${match[2]}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
