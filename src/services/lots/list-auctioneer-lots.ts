//* Libraries imports
import { and, eq, sql } from "drizzle-orm";

//* Schemas imports
import { formatListedMoney as formatMoney } from "../../schemas/money";
import type {
  AuctioneerLotStatus,
  ListAuctioneerLotsQuery,
} from "../../schemas/list-lots";

//* Local imports
import { db } from "../../db/index";
import { bid, lot, wallet, walletMovement } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import { lotListColumns, requireLotStatus } from "./lot-read";
import {
  loadListedLotItems,
  lotListingOrder,
  matchesLotSearch,
} from "./lot-listing";

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
      ...lotListColumns(now),
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
        matchesLotSearch(dependencies.executor, input, now),
      ),
    )
    .orderBy(...lotListingOrder(now));

  const itemsByLotId = await loadListedLotItems(dependencies.executor, rows);

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
      status: requireLotStatus(row.status, "Lot listing"),
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

function formatListedMoney(value: string): string {
  const amount = formatMoney(value);
  if (amount === null) {
    throw new Error("Lot listing returned an unexpected amount");
  }
  return amount;
}
