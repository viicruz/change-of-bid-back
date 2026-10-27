//* Libraries imports
import { and, asc, eq, exists, inArray, lte, ne, or, sql } from "drizzle-orm";

//* Schemas imports
import {
  publicLotListingItemLimit,
  type ListPublicLotsQuery,
  type PublicLotStatus,
} from "../../schemas/list-lots";

//* Local imports
import { db } from "../../db/index";
import { bid, lot, lotItem } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import { isEnded, isLive, isScheduled } from "./effective-lot-status";

export type PublicLotItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
};

export type PublicLot = {
  id: string;
  title: string;
  description: string | null;
  openingBid: string;
  minIncrement: string;
  startsAt: Date;
  endsAt: Date;
  status: PublicLotStatus;
  currentBid: string | null;
  bidCount: number;
  sold: boolean;
  items: PublicLotItem[];
};

export type ListPublicLotsDependencies = {
  now: () => Date;
  executor: DatabaseExecutor;
};

export async function listPublicLots(
  input: ListPublicLotsQuery,
  dependencies: ListPublicLotsDependencies = createDefaultDependencies(),
): Promise<PublicLot[]> {
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
        WHEN ${isEnded(now)} THEN 'ENDED'
        WHEN ${isScheduled(now)} THEN 'SCHEDULED'
        WHEN ${isLive(now)} THEN 'LIVE'
      END`.as("effective_status"),
      currentBid: bid.amount,
      bidCount: lot.bidCount,
      winnerId: lot.winnerId,
    })
    .from(lot)
    .leftJoin(bid, eq(bid.id, lot.currentBidId))
    .where(
      and(
        ne(lot.status, "CANCELED"),
        matchesStatus(input.status, now),
        matchesText(dependencies.executor, input.q),
      ),
    )
    .orderBy(
      sql`CASE
        WHEN ${isLive(now)} THEN 0
        WHEN ${isScheduled(now)} THEN 1
        ELSE 2
      END`,
      sql`CASE WHEN ${isEnded(now)} THEN ${lot.endsAt} END DESC`,
      sql`CASE WHEN ${isScheduled(now)} THEN ${lot.startsAt} END ASC`,
      sql`CASE WHEN ${isLive(now)} THEN ${lot.endsAt} END ASC`,
      asc(lot.id),
    );

  const itemsByLotId = await loadItems(
    dependencies.executor,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
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
    items: itemsByLotId.get(row.id) ?? [],
  }));
}

function createDefaultDependencies(): ListPublicLotsDependencies {
  return {
    now: () => new Date(),
    executor: db,
  };
}

function matchesStatus(status: PublicLotStatus | undefined, now: Date) {
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
  const itemsByLotId = new Map<string, PublicLotItem[]>();

  if (lotIds.length === 0) {
    return itemsByLotId;
  }

  const rankedItems = executor
    .select({
      id: lotItem.id,
      lotId: lotItem.lotId,
      position: lotItem.position,
      cardId: lotItem.cardId,
      quantity: lotItem.quantity,
      cardName: lotItem.cardName,
      imagePath: lotItem.imagePath,
      itemRank: sql<number>`row_number() over (partition by ${lotItem.lotId} order by ${lotItem.position} asc)`.as(
        "item_rank",
      ),
    })
    .from(lotItem)
    .where(inArray(lotItem.lotId, lotIds))
    .as("ranked_lot_items");

  const items = await executor
    .select({
      id: rankedItems.id,
      lotId: rankedItems.lotId,
      position: rankedItems.position,
      cardId: rankedItems.cardId,
      quantity: rankedItems.quantity,
      cardName: rankedItems.cardName,
      imagePath: rankedItems.imagePath,
    })
    .from(rankedItems)
    .where(lte(rankedItems.itemRank, publicLotListingItemLimit))
    .orderBy(asc(rankedItems.lotId), asc(rankedItems.position));

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

function requireStatus(status: string | null): PublicLotStatus {
  if (status === "SCHEDULED" || status === "LIVE" || status === "ENDED") {
    return status;
  }

  throw new Error("Lot listing returned an unexpected status");
}
