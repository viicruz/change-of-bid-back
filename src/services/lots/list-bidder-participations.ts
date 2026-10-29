//* Libraries imports
import { eq } from "drizzle-orm";

//* Schemas imports
import { formatListedMoney as formatMoney } from "../../schemas/money";
import type { BidderParticipationStatus } from "../../schemas/list-bidder-participations";

//* Local imports
import { db } from "../../db/index";
import { bid, lot, lotParticipant, receipt } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import { lotListColumns, requireLotStatus } from "./lot-read";
import type { ListedLotItem } from "./lot-read-types";
import { loadListedLotItems, lotListingOrder } from "./lot-listing";

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

export type BidderParticipationItem = ListedLotItem;

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
  shareToken: string | null;
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
      ...lotListColumns(now),
      participantNo: lotParticipant.participantNo,
      shareToken: receipt.shareToken,
    })
    .from(lotParticipant)
    .innerJoin(lot, eq(lot.id, lotParticipant.lotId))
    .leftJoin(bid, eq(bid.id, lot.currentBidId))
    .leftJoin(receipt, eq(receipt.lotId, lot.id))
    .where(eq(lotParticipant.userId, input.userId))
    .orderBy(...lotListingOrder(now));

  const itemsByLotId = await loadListedLotItems(dependencies.executor, rows);

  return {
    lots: rows.map((row) => {
      const won = row.winnerId === input.userId;

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        openingBid: formatListedMoney(row.openingBid),
        minIncrement: formatListedMoney(row.minIncrement),
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        status: requireLotStatus(row.status, "Participation listing"),
        currentBid:
          row.currentBid === null ? null : formatListedMoney(row.currentBid),
        bidCount: row.bidCount,
        participantNo: row.participantNo,
        won,
        shareToken: shareTokenForBidder(won, row.shareToken),
        items: itemsByLotId.get(row.id) ?? [],
      };
    }),
  };
}

function createDefaultDependencies(): ListBidderParticipationsDependencies {
  return {
    now: () => new Date(),
    executor: db,
  };
}

function shareTokenForBidder(won: boolean, shareToken: string | null) {
  if (!won) {
    return null;
  }

  // Settlement writes the link on the receipt. A win without that row would
  // leave won true and no token, so the listing fails closed.
  if (shareToken === null) {
    throw new Error("Won participation is missing its receipt");
  }

  return shareToken;
}

function formatListedMoney(value: string): string {
  const amount = formatMoney(value);
  if (amount === null) {
    throw new Error("Participation listing returned an unexpected amount");
  }
  return amount;
}
