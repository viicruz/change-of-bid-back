//* Libraries imports
import { randomBytes } from "node:crypto";

//* Models imports
import { findBidById } from "../../models/bid";
import type { DatabaseExecutor } from "../../models/executor";
import {
  listDueLotIds,
  lockLotForUpdate,
  markLotEnded,
} from "../../models/lot";
import { findLotParticipantByUserId } from "../../models/lot-participant";
import { insertReceipt } from "../../models/receipt";
import {
  decreaseTotalAndCommittedBalance,
  findOpenHoldForBid,
  increaseTotalBalance,
  insertSettlementMovement,
  lockWalletsByUserIds,
} from "../../models/wallet";

//* Schemas imports
import { compareMoney, normalizeMoney } from "../../schemas/money";

//* Local imports
import { db } from "../../db/index";

//* Services imports
import { publishPublicLot } from "./public-lot-live";

// 32 bytes in base64url, without padding.
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type LotSettlement =
  | {
      lotId: string;
      outcome: "settled";
      winnerId: string | null;
      endedAt: Date;
      settledAt: Date;
    }
  | {
      lotId: string;
      outcome: "skipped";
    };

export type SettleDueLotsDependencies = {
  now: () => Date;
  createShareToken: () => string;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
  listDueLotIds: typeof listDueLotIds;
  lockLotForUpdate: typeof lockLotForUpdate;
  findBidById: typeof findBidById;
  findLotParticipantByUserId: typeof findLotParticipantByUserId;
  lockWalletsByUserIds: typeof lockWalletsByUserIds;
  findOpenHoldForBid: typeof findOpenHoldForBid;
  insertSettlementMovement: typeof insertSettlementMovement;
  decreaseTotalAndCommittedBalance: typeof decreaseTotalAndCommittedBalance;
  increaseTotalBalance: typeof increaseTotalBalance;
  insertReceipt: typeof insertReceipt;
  markLotEnded: typeof markLotEnded;
};

type LockedLot = NonNullable<Awaited<ReturnType<typeof lockLotForUpdate>>>;
type WinningBid = NonNullable<Awaited<ReturnType<typeof findBidById>>>;
type LockedWallet = Awaited<ReturnType<typeof lockWalletsByUserIds>>[number];
type WinningSettlement = {
  bid: WinningBid;
  participantNo: number;
  winnerWallet: LockedWallet;
  auctioneerWallet: LockedWallet;
  amount: string;
};

export async function settleDueLots(
  dependencies: Partial<SettleDueLotsDependencies> = {},
): Promise<LotSettlement[]> {
  const resolved = {
    ...createDefaultDependencies(),
    ...dependencies,
  };
  const now = resolved.now();
  const lotIds = await resolved.listDueLotIds(db, now);
  const results: LotSettlement[] = [];
  const failures: unknown[] = [];

  for (const lotId of lotIds) {
    let settlement: LotSettlement | undefined;

    try {
      settlement = await resolved.runInTransaction((executor) =>
        settleLockedLot(executor, lotId, now, resolved),
      );
      results.push(settlement);
    } catch (error) {
      failures.push(new LotSettlementError(lotId, error));
    }

    // Skipped lots were extended, canceled, or already ended.
    if (settlement?.outcome === "settled") {
      await publishPublicLot(settlement.lotId);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "Lot settlement failed");
  }

  return results;
}

async function settleLockedLot(
  executor: DatabaseExecutor,
  lotId: string,
  now: Date,
  dependencies: SettleDueLotsDependencies,
): Promise<LotSettlement> {
  const locked = await dependencies.lockLotForUpdate(executor, lotId);

  // The row lock is the meeting point with a bid or a cancellation. A lot that
  // was extended, canceled, or already ended after the scan is left untouched.
  if (
    locked === null ||
    locked.status !== "ACTIVE" ||
    locked.endsAt.getTime() > now.getTime()
  ) {
    return {
      lotId,
      outcome: "skipped",
    };
  }

  if (locked.currentBidId === null) {
    if (locked.bidCount !== 0) {
      throw new Error("Lot has bids but no current bid");
    }

    return endSettledLot(executor, locked, null, now, dependencies);
  }

  const winning = await prepareWinningSettlement(
    executor,
    locked,
    locked.currentBidId,
    dependencies,
  );
  await persistWinningSettlement(executor, locked, winning, dependencies);

  return endSettledLot(
    executor,
    locked,
    winning.bid.bidderId,
    now,
    dependencies,
  );
}

// Keep all steps on the lot transaction's executor. The lot is locked first;
// the wallet model then locks both wallets in stable id order before any writes.
async function prepareWinningSettlement(
  executor: DatabaseExecutor,
  locked: LockedLot,
  currentBidId: string,
  dependencies: SettleDueLotsDependencies,
): Promise<WinningSettlement> {
  if (locked.bidCount < 1) {
    throw new Error("Lot has a current bid but no bid count");
  }

  const currentBid = await dependencies.findBidById(executor, currentBidId);

  if (currentBid === null || currentBid.lotId !== locked.id) {
    throw new Error("Current bid was not found");
  }

  const participant = await dependencies.findLotParticipantByUserId(
    executor,
    locked.id,
    currentBid.bidderId,
  );

  if (participant === null) {
    throw new Error("Winner participant was not found");
  }

  const funding = await lockWinningFunds(
    executor,
    locked,
    currentBid,
    dependencies,
  );

  return {
    bid: currentBid,
    participantNo: participant.participantNo,
    ...funding,
  };
}

async function lockWinningFunds(
  executor: DatabaseExecutor,
  locked: LockedLot,
  currentBid: WinningBid,
  dependencies: SettleDueLotsDependencies,
) {
  const lockedWallets = await dependencies.lockWalletsByUserIds(executor, [
    currentBid.bidderId,
    locked.auctioneerId,
  ]);
  const winnerWallet = lockedWallets.find(
    (entry) => entry.userId === currentBid.bidderId,
  );
  const auctioneerWallet = lockedWallets.find(
    (entry) => entry.userId === locked.auctioneerId,
  );

  if (!winnerWallet || !auctioneerWallet) {
    throw new Error("Settlement wallet was not found");
  }

  const amount = canonicalMoney(currentBid.amount);
  const openHold = await dependencies.findOpenHoldForBid(executor, {
    lotId: locked.id,
    bidId: currentBid.id,
    walletId: winnerWallet.id,
  });

  if (
    openHold === null ||
    compareMoney(canonicalMoney(openHold.amount), amount) !== 0
  ) {
    throw new Error("Open hold for the winning bid was not found");
  }

  if (compareMoney(canonicalMoney(winnerWallet.committedBalance), amount) < 0) {
    throw new Error("Winner committed balance does not cover the winning bid");
  }

  return { winnerWallet, auctioneerWallet, amount };
}

async function persistWinningSettlement(
  executor: DatabaseExecutor,
  locked: LockedLot,
  {
    bid,
    participantNo,
    winnerWallet,
    auctioneerWallet,
    amount,
  }: WinningSettlement,
  dependencies: SettleDueLotsDependencies,
) {
  // A failure at any later step rolls back the movements, balances, receipt,
  // and lot closure together, including a unique constraint violation.
  await dependencies.insertSettlementMovement(executor, {
    walletId: winnerWallet.id,
    type: "SETTLEMENT_DEBIT",
    amount,
    lotId: locked.id,
  });
  await dependencies.decreaseTotalAndCommittedBalance(
    executor,
    winnerWallet.id,
    amount,
  );
  await dependencies.insertSettlementMovement(executor, {
    walletId: auctioneerWallet.id,
    type: "SETTLEMENT_CREDIT",
    amount,
    lotId: locked.id,
  });
  await dependencies.increaseTotalBalance(
    executor,
    auctioneerWallet.id,
    amount,
  );

  const shareToken = dependencies.createShareToken();

  if (!SHARE_TOKEN_PATTERN.test(shareToken)) {
    throw new Error("Share token must be 32 bytes encoded as base64url");
  }

  await dependencies.insertReceipt(executor, {
    lotId: locked.id,
    winningBidId: bid.id,
    winnerId: bid.bidderId,
    winnerParticipantNo: participantNo,
    finalAmount: amount,
    endedAt: locked.endsAt,
    shareToken,
  });
}

async function endSettledLot(
  executor: DatabaseExecutor,
  locked: LockedLot,
  winnerId: string | null,
  now: Date,
  dependencies: SettleDueLotsDependencies,
): Promise<LotSettlement> {
  const ended = await dependencies.markLotEnded(executor, locked.id, {
    winnerId,
    endedAt: locked.endsAt,
    settledAt: now,
  });

  return {
    lotId: ended.id,
    outcome: "settled",
    winnerId: ended.winnerId,
    endedAt: ended.endedAt,
    settledAt: ended.settledAt,
  };
}

export class LotSettlementError extends Error {
  readonly lotId: string;

  constructor(lotId: string, cause: unknown) {
    super(`Lot ${lotId} settlement failed`, { cause });
    this.name = "LotSettlementError";
    this.lotId = lotId;
  }
}

export function describeSettlementFailure(error: unknown) {
  const lotIds =
    error instanceof AggregateError
      ? error.errors
          .flatMap((entry) =>
            entry instanceof LotSettlementError ? [entry.lotId] : [],
          )
          .sort()
      : [];
  const target =
    lotIds.length > 0 ? `for ${lotIds.join(", ")}` : "for one or more lots";

  return `Lot settlement failed ${target}. Those lots stay ACTIVE, so the public API shows them as ended while the winner's reserve stays committed. The job will retry.`;
}

function canonicalMoney(value: string) {
  const normalized = normalizeMoney(value);

  if (normalized !== null) {
    return normalized;
  }

  if (/^0(?:\.0{1,2})?$/.test(value.trim())) {
    return "0.00";
  }

  throw new Error("Stored money value is invalid");
}

function createDefaultDependencies(): SettleDueLotsDependencies {
  return {
    now: () => new Date(),
    createShareToken: () => randomBytes(32).toString("base64url"),
    runInTransaction: (work) => db.transaction((tx) => work(tx)),
    listDueLotIds,
    lockLotForUpdate,
    findBidById,
    findLotParticipantByUserId,
    lockWalletsByUserIds,
    findOpenHoldForBid,
    insertSettlementMovement,
    decreaseTotalAndCommittedBalance,
    increaseTotalBalance,
    insertReceipt,
    markLotEnded,
  };
}
