//* Schemas imports
import {
  addMoney,
  compareMoney,
  MoneyRangeError,
  moneyValidationMessage,
  normalizeMoney,
} from "../../schemas/money";

//* Models imports
import { findBidById, insertBid } from "../../models/bid";
import type { DatabaseExecutor } from "../../models/executor";
import { lockLotForUpdate, markLotLeadingBid } from "../../models/lot";
import { findOrCreateLotParticipant } from "../../models/lot-participant";
import {
  decreaseCommittedBalance,
  increaseCommittedBalance,
  insertHoldMovement,
  insertReleaseMovement,
  lockWalletsByUserIds,
  walletCoversAmount,
} from "../../models/wallet";

//* Local imports
import { db } from "../../db/index";
import { env } from "../../env";

//* Services imports
import { canonicalBidTimestamp, chainBidHash, genesisBidHash } from "./bid-hash";
import { publishPublicLot } from "./public-lot-live";

// An accepted bid inside the last two minutes extends the current end by two
// minutes. The window is inclusive, and each later accepted bid can extend again.
const ANTI_SNIPE_EXTENSION_MS = 2 * 60 * 1000;

const placeBidErrorCodes = [
  "NOT_BIDDER",
  "INVALID_MONEY",
  "LOT_NOT_FOUND",
  "LOT_NOT_STARTED",
  "LOT_ENDED",
  "LOT_CANCELED",
  "ALREADY_LEADER",
  "BID_BELOW_MINIMUM",
  "INSUFFICIENT_BALANCE",
] as const;

export type PlaceBidErrorCode = (typeof placeBidErrorCodes)[number];

export class PlaceBidError extends Error {
  readonly code: PlaceBidErrorCode;

  constructor(code: PlaceBidErrorCode, message: string) {
    super(message);
    this.name = "PlaceBidError";
    this.code = code;
  }
}

export type PlaceBidInput = {
  lotId: string;
  userId: string;
  role: string;
  amount: unknown;
};

export type AcceptedBid = {
  id: string;
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
  endsAt: Date;
  extensionCount: number;
};

export type PlaceBidDependencies = {
  now: () => Date;
  hashSecret: string;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
  lockLotForUpdate: typeof lockLotForUpdate;
  findBidById: typeof findBidById;
  lockWalletsByUserIds: typeof lockWalletsByUserIds;
  walletCoversAmount: typeof walletCoversAmount;
  findOrCreateLotParticipant: typeof findOrCreateLotParticipant;
  insertBid: typeof insertBid;
  insertHoldMovement: typeof insertHoldMovement;
  insertReleaseMovement: typeof insertReleaseMovement;
  increaseCommittedBalance: typeof increaseCommittedBalance;
  decreaseCommittedBalance: typeof decreaseCommittedBalance;
  markLotLeadingBid: typeof markLotLeadingBid;
};

export async function placeBid(
  input: PlaceBidInput,
  dependencies: Partial<PlaceBidDependencies> = {},
): Promise<AcceptedBid> {
  const resolved = {
    ...createDefaultDependencies(),
    ...dependencies,
  };

  if (input.role !== "BIDDER") {
    throw new PlaceBidError(
      "NOT_BIDDER",
      "Only a bidder can place a bid.",
    );
  }

  const amount = parseBidAmount(input.amount);

  const accepted = await resolved.runInTransaction(async (executor) => {
    const locked = await resolved.lockLotForUpdate(executor, input.lotId);

    if (locked === null) {
      throw new PlaceBidError("LOT_NOT_FOUND", "Lot was not found.");
    }

    const now = resolved.now();

    if (locked.status === "CANCELED") {
      throw new PlaceBidError(
        "LOT_CANCELED",
        "Bids are not accepted on a canceled lot.",
      );
    }

    if (locked.status === "ENDED" || locked.endsAt.getTime() <= now.getTime()) {
      throw new PlaceBidError(
        "LOT_ENDED",
        "Bids are not accepted after the lot ends.",
      );
    }

    if (locked.startsAt.getTime() > now.getTime()) {
      throw new PlaceBidError(
        "LOT_NOT_STARTED",
        "Bids are not accepted before the lot starts.",
      );
    }

    const currentBid =
      locked.currentBidId === null
        ? null
        : await resolved.findBidById(executor, locked.currentBidId);

    if (locked.currentBidId !== null) {
      if (currentBid === null || currentBid.lotId !== locked.id) {
        throw new Error("Current bid was not found");
      }

      if (
        currentBid.sequence !== locked.bidCount ||
        locked.headHash !== currentBid.hash
      ) {
        throw new Error("Current bid does not match the lot head");
      }

      if (currentBid.bidderId === input.userId) {
        throw new PlaceBidError(
          "ALREADY_LEADER",
          "The current leader cannot outbid themselves.",
        );
      }
    }

    const minimum = minimumAcceptedAmount(
      storedMoney(locked.openingBid),
      currentBid === null ? null : storedMoney(currentBid.amount),
      storedMoney(locked.minIncrement),
    );

    if (compareMoney(amount, minimum) < 0) {
      throw new PlaceBidError(
        "BID_BELOW_MINIMUM",
        "The bid is below the minimum accepted amount.",
      );
    }

    const lockedWallets = await resolved.lockWalletsByUserIds(
      executor,
      currentBid === null
        ? [input.userId]
        : [input.userId, currentBid.bidderId],
    );
    const bidderWallet = lockedWallets.find(
      (entry) => entry.userId === input.userId,
    );

    if (!bidderWallet) {
      throw new Error("Bidder wallet was not found");
    }

    const covers = await resolved.walletCoversAmount(
      executor,
      bidderWallet.id,
      amount,
    );

    if (!covers) {
      throw new PlaceBidError(
        "INSUFFICIENT_BALANCE",
        "The available balance does not cover this bid.",
      );
    }

    const participant = await resolved.findOrCreateLotParticipant(
      executor,
      locked.id,
      input.userId,
    );
    const createdAtCanonical = canonicalBidTimestamp(now);
    const createdAt = new Date(createdAtCanonical);
    const sequence = locked.bidCount + 1;
    const previousHash =
      currentBid === null
        ? genesisBidHash(resolved.hashSecret, locked.id)
        : currentBid.hash;
    const hash = chainBidHash(resolved.hashSecret, {
      previousHash,
      lotId: locked.id,
      sequence,
      participantNo: participant.participantNo,
      amount,
      createdAt: createdAtCanonical,
    });
    const inserted = await resolved.insertBid(executor, {
      lotId: locked.id,
      participantId: participant.id,
      bidderId: input.userId,
      sequence,
      amount,
      createdAt,
      previousHash,
      hash,
    });

    if (canonicalBidTimestamp(asDate(inserted.createdAt)) !== createdAtCanonical) {
      throw new Error("Persisted bid timestamp does not match the hashed instant");
    }

    await resolved.insertHoldMovement(executor, {
      walletId: bidderWallet.id,
      amount,
      lotId: locked.id,
      bidId: inserted.id,
    });
    await resolved.increaseCommittedBalance(executor, bidderWallet.id, amount);

    if (currentBid !== null) {
      const leaderWallet = lockedWallets.find(
        (entry) => entry.userId === currentBid.bidderId,
      );

      if (!leaderWallet) {
        throw new Error("Leader wallet was not found");
      }

      const releasedAmount = storedMoney(currentBid.amount);

      await resolved.insertReleaseMovement(executor, {
        walletId: leaderWallet.id,
        amount: releasedAmount,
        lotId: locked.id,
        bidId: currentBid.id,
      });
      await resolved.decreaseCommittedBalance(
        executor,
        leaderWallet.id,
        releasedAmount,
      );
    }

    const schedule = antiSnipeExtension(locked.endsAt, locked.extensionCount, now);
    const marked = await resolved.markLotLeadingBid(executor, locked.id, {
      currentBidId: inserted.id,
      bidCount: sequence,
      headHash: hash,
      ...(schedule === null ? {} : { schedule }),
    });

    return {
      id: inserted.id,
      sequence: inserted.sequence,
      amount: storedMoney(inserted.amount),
      createdAt: asDate(inserted.createdAt),
      participantNo: participant.participantNo,
      endsAt: marked.endsAt,
      extensionCount: marked.extensionCount,
    };
  });

  // The bid is committed. A rejection throws inside the transaction and never
  // reaches the room.
  await publishPublicLot(input.lotId);

  return accepted;
}

function createDefaultDependencies(): PlaceBidDependencies {
  return {
    now: () => new Date(),
    hashSecret: env.BID_HASH_SECRET,
    runInTransaction: (work) => db.transaction((tx) => work(tx)),
    lockLotForUpdate,
    findBidById,
    lockWalletsByUserIds,
    walletCoversAmount,
    findOrCreateLotParticipant,
    insertBid,
    insertHoldMovement,
    insertReleaseMovement,
    increaseCommittedBalance,
    decreaseCommittedBalance,
    markLotLeadingBid,
  };
}

function minimumAcceptedAmount(
  openingBid: string,
  currentAmount: string | null,
  minIncrement: string,
): string {
  if (currentAmount === null) {
    return openingBid;
  }

  try {
    return addMoney(currentAmount, minIncrement);
  } catch (error) {
    if (error instanceof MoneyRangeError) {
      throw new PlaceBidError(
        "BID_BELOW_MINIMUM",
        "The bid is below the minimum accepted amount.",
      );
    }

    throw error;
  }
}

function antiSnipeExtension(endsAt: Date, extensionCount: number, now: Date) {
  const remainingMs = endsAt.getTime() - now.getTime();

  if (remainingMs <= 0 || remainingMs > ANTI_SNIPE_EXTENSION_MS) {
    return null;
  }

  return {
    endsAt: new Date(endsAt.getTime() + ANTI_SNIPE_EXTENSION_MS),
    extensionCount: extensionCount + 1,
  };
}

function parseBidAmount(amount: unknown): string {
  if (typeof amount !== "string") {
    throw new PlaceBidError("INVALID_MONEY", moneyValidationMessage);
  }

  const normalized = normalizeMoney(amount);

  if (normalized === null) {
    throw new PlaceBidError("INVALID_MONEY", moneyValidationMessage);
  }

  return normalized;
}

function storedMoney(value: string): string {
  const normalized = normalizeMoney(value);

  if (normalized === null) {
    throw new Error("Stored money value is invalid");
  }

  return normalized;
}

function asDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Bid timestamp is invalid");
  }

  return parsed;
}
