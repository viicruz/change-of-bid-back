//* Libraries imports
import { and, eq, ne } from "drizzle-orm";

//* Schemas imports
import {
  publicLotListingItemLimit,
  type ListPublicLotsQuery,
  type PublicLotStatus,
} from "../../schemas/list-lots";

//* Local imports
import { db } from "../../db/index";
import { bid, lot } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import { lotListColumns } from "./lot-read";
import {
  loadListedLotItems,
  lotListingOrder,
  matchesLotSearch,
} from "./lot-listing";

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
      ...lotListColumns(now),
    })
    .from(lot)
    .leftJoin(bid, eq(bid.id, lot.currentBidId))
    .where(
      and(
        ne(lot.status, "CANCELED"),
        matchesLotSearch(dependencies.executor, input, now),
      ),
    )
    .orderBy(...lotListingOrder(now));

  const itemsByLotId = await loadListedLotItems(
    dependencies.executor,
    rows,
    publicLotListingItemLimit,
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

function requireStatus(status: string | null): PublicLotStatus {
  if (status === "SCHEDULED" || status === "LIVE" || status === "ENDED") {
    return status;
  }

  throw new Error("Lot listing returned an unexpected status");
}
