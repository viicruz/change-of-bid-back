//* Libraries imports
import { asc, eq } from "drizzle-orm";
import { expect } from "vitest";

//* Local imports
import { db } from "../../../../db/index";
import { lot, wallet, walletMovement } from "../../../../db/schema";
import type { LeadingBid } from "./bids";

export async function readLot(lotId: string) {
  const rows = await db
    .select({
      status: lot.status,
      canceledAt: lot.canceledAt,
      currentBidId: lot.currentBidId,
      bidCount: lot.bidCount,
      headHash: lot.headHash,
      winnerId: lot.winnerId,
      endsAt: lot.endsAt,
    })
    .from(lot)
    .where(eq(lot.id, lotId));

  return rows[0];
}

export async function readWallet(walletId: string) {
  const rows = await db
    .select({
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    })
    .from(wallet)
    .where(eq(wallet.id, walletId));

  return rows[0];
}

export async function readMovements(lotId: string) {
  return db
    .select({
      type: walletMovement.type,
      amount: walletMovement.amount,
      bidId: walletMovement.bidId,
    })
    .from(walletMovement)
    .where(eq(walletMovement.lotId, lotId))
    .orderBy(asc(walletMovement.createdAt), asc(walletMovement.type));
}

export async function readReleases(lotId: string) {
  return (await readMovements(lotId)).filter(
    (movement) => movement.type === "RELEASE",
  );
}

// The leader seeded by attachLeadingBid has a total balance of 100.00.
export async function expectLeaderReserveKept(
  lotId: string,
  leader: LeadingBid,
  amount: string,
) {
  const leaderWallet = await readWallet(leader.walletId);
  const movements = await readMovements(lotId);

  expect(leaderWallet).toEqual({
    totalBalance: "100.00",
    committedBalance: amount,
  });
  expect(movements).toEqual([
    { type: "HOLD", amount, bidId: leader.bidId },
  ]);
}

// The leader seeded by attachLeadingBid has a total balance of 100.00.
export async function expectLeaderReserveReleased(
  lotId: string,
  leader: LeadingBid,
  amount: string,
) {
  const leaderWallet = await readWallet(leader.walletId);
  const movements = await readMovements(lotId);

  expect(leaderWallet).toEqual({
    totalBalance: "100.00",
    committedBalance: "0.00",
  });
  expect(movements).toEqual([
    { type: "HOLD", amount, bidId: leader.bidId },
    { type: "RELEASE", amount, bidId: leader.bidId },
  ]);
}
