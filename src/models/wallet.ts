//* Libraries imports
import { eq, sql } from "drizzle-orm";

//* Local imports
import { wallet, walletMovement } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export async function lockWalletByUserId(
  executor: DatabaseExecutor,
  userId: string,
) {
  const rows = await executor
    .select({
      id: wallet.id,
      userId: wallet.userId,
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    })
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .for("update");

  return rows[0] ?? null;
}

export async function insertReleaseMovement(
  executor: DatabaseExecutor,
  values: {
    walletId: string;
    amount: string;
    lotId: string;
    bidId: string;
  },
) {
  const rows = await executor
    .insert(walletMovement)
    .values({
      walletId: values.walletId,
      type: "RELEASE",
      amount: values.amount,
      lotId: values.lotId,
      bidId: values.bidId,
    })
    .returning({ id: walletMovement.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert wallet movement did not return a row");
  }

  return row;
}

export async function decreaseCommittedBalance(
  executor: DatabaseExecutor,
  walletId: string,
  amount: string,
) {
  const rows = await executor
    .update(wallet)
    .set({
      committedBalance: sql`${wallet.committedBalance} - ${amount}::numeric(18,2)`,
    })
    .where(eq(wallet.id, walletId))
    .returning({
      id: wallet.id,
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    });
  const row = rows[0];

  if (!row) {
    throw new Error("Wallet balance update did not return a row");
  }

  return row;
}
