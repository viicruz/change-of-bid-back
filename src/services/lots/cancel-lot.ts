//* Models imports
import { findBidById } from "../../models/bid";
import type { DatabaseExecutor } from "../../models/executor";
import { lockLotForUpdate, markLotCanceled } from "../../models/lot";
import {
  decreaseCommittedBalance,
  insertReleaseMovement,
  lockWalletByUserId,
} from "../../models/wallet";

//* Local imports
import { db } from "../../db/index";

//* Services imports
import { publishPublicLot } from "./public-lot-live";

const cancelLotErrorCodes = [
  "NOT_AUCTIONEER",
  "LOT_NOT_OWNED",
  "LOT_NOT_FOUND",
  "LOT_NOT_CANCELABLE",
] as const;

export type CancelLotErrorCode = (typeof cancelLotErrorCodes)[number];

export class CancelLotError extends Error {
  readonly code: CancelLotErrorCode;

  constructor(code: CancelLotErrorCode, message: string) {
    super(message);
    this.name = "CancelLotError";
    this.code = code;
  }
}

export type CancelLotInput = {
  lotId: string;
  auctioneerId: string;
  role: string;
};

export type CanceledLot = {
  id: string;
  status: "CANCELED";
  canceledAt: Date;
};

export type CancelLotDependencies = {
  now: () => Date;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
  lockLotForUpdate: typeof lockLotForUpdate;
  findBidById: typeof findBidById;
  lockWalletByUserId: typeof lockWalletByUserId;
  insertReleaseMovement: typeof insertReleaseMovement;
  decreaseCommittedBalance: typeof decreaseCommittedBalance;
  markLotCanceled: typeof markLotCanceled;
};

export async function cancelLot(
  input: CancelLotInput,
  dependencies: Partial<CancelLotDependencies> = {},
): Promise<CanceledLot> {
  const resolved = {
    ...createDefaultDependencies(),
    ...dependencies,
  };

  if (input.role !== "AUCTIONEER") {
    throw new CancelLotError(
      "NOT_AUCTIONEER",
      "Only an auctioneer can cancel a lot.",
    );
  }

  const result = await resolved.runInTransaction(async (executor) => {
    const locked = await resolved.lockLotForUpdate(executor, input.lotId);

    if (locked === null) {
      throw new CancelLotError("LOT_NOT_FOUND", "Lot was not found.");
    }

    if (locked.auctioneerId !== input.auctioneerId) {
      throw new CancelLotError(
        "LOT_NOT_OWNED",
        "Only the owner can cancel this lot.",
      );
    }

    if (locked.status === "CANCELED") {
      if (locked.canceledAt === null) {
        throw new Error("Canceled lot is missing canceledAt");
      }

      return {
        changed: false,
        lot: {
          id: locked.id,
          status: locked.status,
          canceledAt: locked.canceledAt,
        },
      };
    }

    const now = resolved.now();

    if (locked.status === "ENDED" || locked.endsAt.getTime() <= now.getTime()) {
      throw new CancelLotError(
        "LOT_NOT_CANCELABLE",
        "Only a scheduled or live lot can be canceled.",
      );
    }

    if (locked.currentBidId !== null) {
      await releaseLeaderReserve(
        executor,
        resolved,
        locked.id,
        locked.currentBidId,
      );
    }

    return {
      changed: true,
      lot: await resolved.markLotCanceled(executor, locked.id, now),
    };
  });

  if (result.changed) {
    await publishPublicLot(result.lot.id);
  }

  return result.lot;
}

async function releaseLeaderReserve(
  executor: DatabaseExecutor,
  dependencies: CancelLotDependencies,
  lotId: string,
  bidId: string,
) {
  const currentBid = await dependencies.findBidById(executor, bidId);

  if (currentBid === null || currentBid.lotId !== lotId) {
    throw new Error("Current bid was not found");
  }

  const leaderWallet = await dependencies.lockWalletByUserId(
    executor,
    currentBid.bidderId,
  );

  if (leaderWallet === null) {
    throw new Error("Leader wallet was not found");
  }

  await dependencies.insertReleaseMovement(executor, {
    walletId: leaderWallet.id,
    amount: currentBid.amount,
    lotId,
    bidId: currentBid.id,
  });
  await dependencies.decreaseCommittedBalance(
    executor,
    leaderWallet.id,
    currentBid.amount,
  );
}

function createDefaultDependencies(): CancelLotDependencies {
  return {
    now: () => new Date(),
    runInTransaction: (work) => db.transaction((tx) => work(tx)),
    lockLotForUpdate,
    findBidById,
    lockWalletByUserId,
    insertReleaseMovement,
    decreaseCommittedBalance,
    markLotCanceled,
  };
}
