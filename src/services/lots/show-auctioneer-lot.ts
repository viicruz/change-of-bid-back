//* Libraries imports
import { and, eq } from "drizzle-orm";

//* Schemas imports
import { formatListedMoney as formatMoney } from "../../schemas/money";
import type { ShowAuctioneerLotStatus } from "../../schemas/show-auctioneer-lot";

//* Local imports
import { wallet, walletMovement } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import {
  findShownLot,
  loadShownLotItems,
  loadShownLotBids,
  presentShownLot,
  runLotRead,
} from "./lot-read";

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
    const row = await findShownLot(executor, input.lotId, now);

    if (row === null) {
      throw new ShowAuctioneerLotError("LOT_NOT_FOUND", "Lot was not found.");
    }

    if (row.auctioneerId !== input.auctioneerId) {
      throw new ShowAuctioneerLotError(
        "LOT_NOT_OWNED",
        "Only the owner can view this lot.",
      );
    }

    const items = await loadShownLotItems(executor, input.lotId);
    const bids = await loadShownLotBids(executor, input.lotId);
    const receivedAmount = await loadReceivedAmount(
      executor,
      input.lotId,
      input.auctioneerId,
    );
    return {
      serverNow: now,
      lot: {
        ...presentShownLot(row, items, bids),
        receivedAmount,
      },
    };
  });
}

function createDefaultDependencies(): ShowAuctioneerLotDependencies {
  return {
    now: () => new Date(),
    runInTransaction: runLotRead,
  };
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

function formatShownMoney(value: string): string {
  const amount = formatMoney(value);
  if (amount === null) {
    throw new Error("Lot show returned an unexpected amount");
  }
  return amount;
}
