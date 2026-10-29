//* Libraries imports
import { asc, eq } from "drizzle-orm";

//* Local imports
import { db } from "../../../../db/index";
import { bid, lot, receipt, walletMovement } from "../../../../db/schema";

//* Models imports
import { findWalletByUserId } from "../../../../models/wallet";

export async function readLot(lotId: string) {
  const rows = await db
    .select({
      status: lot.status,
      endsAt: lot.endsAt,
      originalEndsAt: lot.originalEndsAt,
      extensionCount: lot.extensionCount,
      currentBidId: lot.currentBidId,
      bidCount: lot.bidCount,
      winnerId: lot.winnerId,
      endedAt: lot.endedAt,
      settledAt: lot.settledAt,
      canceledAt: lot.canceledAt,
    })
    .from(lot)
    .where(eq(lot.id, lotId));

  return rows[0];
}

export async function readBids(lotId: string) {
  return db
    .select({
      id: bid.id,
      bidderId: bid.bidderId,
      amount: bid.amount,
      sequence: bid.sequence,
    })
    .from(bid)
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));
}

export async function readMovements(lotId: string) {
  return db
    .select({
      type: walletMovement.type,
      amount: walletMovement.amount,
      bidId: walletMovement.bidId,
      walletId: walletMovement.walletId,
    })
    .from(walletMovement)
    .where(eq(walletMovement.lotId, lotId))
    .orderBy(asc(walletMovement.createdAt), asc(walletMovement.id));
}

export async function readReceipts(lotId: string) {
  return db
    .select({
      lotId: receipt.lotId,
      winningBidId: receipt.winningBidId,
      winnerId: receipt.winnerId,
      winnerParticipantNo: receipt.winnerParticipantNo,
      finalAmount: receipt.finalAmount,
      endedAt: receipt.endedAt,
      shareToken: receipt.shareToken,
    })
    .from(receipt)
    .where(eq(receipt.lotId, lotId));
}

export async function readWallet(userId: string) {
  const balances = await findWalletByUserId(db, userId);

  if (balances === null) {
    throw new Error("Wallet was not found");
  }

  return balances;
}
