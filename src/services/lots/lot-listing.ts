import { and, asc, exists, inArray, lte, or, sql } from "drizzle-orm";
import { lot, lotItem } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import type { AuctioneerLotStatus } from "../../schemas/list-lots";
import {
  isCanceled,
  isEnded,
  isLive,
  isScheduled,
} from "./effective-lot-status";
import { lotItemColumns } from "./lot-read";

export function lotListingOrder(now: Date) {
  return [
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
  ];
}

function matchesLotStatus(status: AuctioneerLotStatus | undefined, now: Date) {
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

function matchesLotText(executor: DatabaseExecutor, q: string | undefined) {
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

type ListedItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
};

export async function loadListedLotItems(
  executor: DatabaseExecutor,
  lots: readonly { id: string }[],
  limitPerLot?: number,
) {
  const itemsByLotId = new Map<string, ListedItem[]>();
  if (lots.length === 0) return itemsByLotId;

  const lotIds = lots.map((row) => row.id);

  const items =
    limitPerLot === undefined
      ? await executor
          .select({ ...lotItemColumns, lotId: lotItem.lotId })
          .from(lotItem)
          .where(inArray(lotItem.lotId, lotIds))
          .orderBy(asc(lotItem.lotId), asc(lotItem.position))
      : await loadLimitedItems(executor, lotIds, limitPerLot);

  for (const { lotId, ...item } of items) {
    const grouped = itemsByLotId.get(lotId) ?? [];
    grouped.push(item);
    itemsByLotId.set(lotId, grouped);
  }
  return itemsByLotId;
}

function loadLimitedItems(
  executor: DatabaseExecutor,
  lotIds: string[],
  limit: number,
) {
  const rankedItems = executor
    .select({
      ...lotItemColumns,
      lotId: lotItem.lotId,
      itemRank:
        sql<number>`row_number() over (partition by ${lotItem.lotId} order by ${lotItem.position} asc)`.as(
          "item_rank",
        ),
    })
    .from(lotItem)
    .where(inArray(lotItem.lotId, lotIds))
    .as("ranked_lot_items");

  return executor
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
    .where(lte(rankedItems.itemRank, limit))
    .orderBy(asc(rankedItems.lotId), asc(rankedItems.position));
}

export function matchesLotSearch(
  executor: DatabaseExecutor,
  input: { status?: AuctioneerLotStatus; q?: string },
  now: Date,
) {
  return and(
    matchesLotStatus(input.status, now),
    matchesLotText(executor, input.q),
  );
}
