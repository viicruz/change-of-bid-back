//* Libraries imports
import { count, desc, eq, sql } from "drizzle-orm";

//* Local imports
import { wallet, walletMovement } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export type WalletBalances = {
  id: string;
  userId: string;
  totalBalance: string;
  committedBalance: string;
  availableBalance: string;
};

export type WalletMovementRow = {
  id: string;
  type:
    | "DEPOSIT"
    | "HOLD"
    | "RELEASE"
    | "SETTLEMENT_DEBIT"
    | "SETTLEMENT_CREDIT";
  amount: string;
  lotId: string | null;
  bidId: string | null;
  createdAt: Date;
};

export async function findWalletByUserId(
  executor: DatabaseExecutor,
  userId: string,
): Promise<WalletBalances | null> {
  const rows = await executor
    .select({
      id: wallet.id,
      userId: wallet.userId,
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
      availableBalance: sql<string>`(${wallet.totalBalance} - ${wallet.committedBalance})::numeric(18, 2)`,
    })
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.userId,
    totalBalance: formatWalletMoney(row.totalBalance),
    committedBalance: formatWalletMoney(row.committedBalance),
    availableBalance: formatWalletMoney(row.availableBalance),
  };
}

export async function listWalletMovementsByWalletId(
  executor: DatabaseExecutor,
  walletId: string,
  page: {
    limit: number;
    offset: number;
  },
): Promise<{ movements: WalletMovementRow[]; total: number }> {
  const movementRows = await executor
    .select({
      id: walletMovement.id,
      type: walletMovement.type,
      amount: walletMovement.amount,
      lotId: walletMovement.lotId,
      bidId: walletMovement.bidId,
      createdAt: walletMovement.createdAt,
    })
    .from(walletMovement)
    .where(eq(walletMovement.walletId, walletId))
    .orderBy(desc(walletMovement.createdAt), desc(walletMovement.id))
    .limit(page.limit)
    .offset(page.offset);
  const totalRows = await executor
    .select({ total: count() })
    .from(walletMovement)
    .where(eq(walletMovement.walletId, walletId));

  return {
    movements: movementRows.map((row) => ({
      ...row,
      amount: formatWalletMoney(row.amount),
    })),
    total: Number(totalRows[0]?.total ?? 0),
  };
}

function formatWalletMoney(value: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());

  if (match === null) {
    throw new Error("Wallet query returned an unexpected amount");
  }

  const fraction = match[3] ?? "";

  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error("Wallet query returned an unexpected amount");
  }

  return `${match[1]}${match[2]}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

export async function createWallet(
  executor: DatabaseExecutor,
  userId: string,
) {
  const inserted = await executor
    .insert(wallet)
    .values({ userId })
    .onConflictDoNothing({ target: wallet.userId })
    .returning({
      id: wallet.id,
      userId: wallet.userId,
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    });
  const created = inserted[0];

  if (created) {
    return created;
  }

  const rows = await executor
    .select({
      id: wallet.id,
      userId: wallet.userId,
      totalBalance: wallet.totalBalance,
      committedBalance: wallet.committedBalance,
    })
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1);
  const existing = rows[0];

  if (!existing) {
    throw new Error("Wallet was not created");
  }

  return existing;
}

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
