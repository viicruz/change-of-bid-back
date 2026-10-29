//* Libraries imports
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

//* Schemas imports
import { formatListedMoney as formatMoney } from "../schemas/money";

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

export async function createWallet(executor: DatabaseExecutor, userId: string) {
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
  return insertWalletMovement(executor, {
    walletId: values.walletId,
    type: "RELEASE",
    amount: values.amount,
    lotId: values.lotId,
    bidId: values.bidId,
  });
}

export async function insertDepositMovement(
  executor: DatabaseExecutor,
  values: {
    walletId: string;
    amount: string;
  },
) {
  return insertWalletMovement(executor, {
    walletId: values.walletId,
    type: "DEPOSIT",
    amount: values.amount,
    lotId: null,
    bidId: null,
  });
}

export async function increaseTotalBalance(
  executor: DatabaseExecutor,
  walletId: string,
  amount: string,
) {
  return updateWalletBalances(executor, walletId, {
    totalBalance: sql`${wallet.totalBalance} + ${amount}::numeric(18,2)`,
  });
}

export async function lockWalletsByUserIds(
  executor: DatabaseExecutor,
  userIds: string[],
) {
  const uniqueUserIds = [...new Set(userIds)];

  if (uniqueUserIds.length === 0) {
    throw new Error("At least one wallet is required");
  }

  const idRows = await executor
    .select({
      id: wallet.id,
    })
    .from(wallet)
    .where(inArray(wallet.userId, uniqueUserIds));

  if (idRows.length !== uniqueUserIds.length) {
    throw new Error("Wallet was not found");
  }

  // Lock one row at a time in id order. PostgreSQL can lock a sorted
  // SELECT before it applies ORDER BY, which reintroduces deadlocks.
  const sortedIds = idRows
    .map((row) => row.id)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const locked = [];

  for (const walletId of sortedIds) {
    const rows = await executor
      .select({
        id: wallet.id,
        userId: wallet.userId,
        totalBalance: wallet.totalBalance,
        committedBalance: wallet.committedBalance,
      })
      .from(wallet)
      .where(eq(wallet.id, walletId))
      .for("update");
    const row = rows[0];

    if (!row) {
      throw new Error("Wallet was not found");
    }

    locked.push(row);
  }

  return locked;
}

export async function walletCoversAmount(
  executor: DatabaseExecutor,
  walletId: string,
  amount: string,
) {
  const rows = await executor
    .select({ id: wallet.id })
    .from(wallet)
    .where(
      and(
        eq(wallet.id, walletId),
        sql`(${wallet.totalBalance} - ${wallet.committedBalance}) >= ${amount}::numeric(18,2)`,
      ),
    )
    .limit(1);

  return rows.length === 1;
}

export async function insertHoldMovement(
  executor: DatabaseExecutor,
  values: {
    walletId: string;
    amount: string;
    lotId: string;
    bidId: string;
  },
) {
  return insertWalletMovement(executor, {
    walletId: values.walletId,
    type: "HOLD",
    amount: values.amount,
    lotId: values.lotId,
    bidId: values.bidId,
  });
}

export async function increaseCommittedBalance(
  executor: DatabaseExecutor,
  walletId: string,
  amount: string,
) {
  return updateWalletBalances(executor, walletId, {
    committedBalance: sql`${wallet.committedBalance} + ${amount}::numeric(18,2)`,
  });
}

export async function decreaseCommittedBalance(
  executor: DatabaseExecutor,
  walletId: string,
  amount: string,
) {
  return updateWalletBalances(executor, walletId, {
    committedBalance: sql`${wallet.committedBalance} - ${amount}::numeric(18,2)`,
  });
}

// Settlement spends the reserve in one statement: committed and total both
// fall by the winning amount. The HOLD row stays in the ledger, so committed
// falls only here.
export async function decreaseTotalAndCommittedBalance(
  executor: DatabaseExecutor,
  walletId: string,
  amount: string,
) {
  return updateWalletBalances(executor, walletId, {
    totalBalance: sql`${wallet.totalBalance} - ${amount}::numeric(18,2)`,
    committedBalance: sql`${wallet.committedBalance} - ${amount}::numeric(18,2)`,
  });
}

// A winning bid still has its HOLD and no RELEASE. Another lot's reserve must
// not be spent when this hold is already closed.
export async function findOpenHoldForBid(
  executor: DatabaseExecutor,
  values: {
    lotId: string;
    bidId: string;
    walletId: string;
  },
) {
  const rows = await executor
    .select({
      type: walletMovement.type,
      amount: walletMovement.amount,
      walletId: walletMovement.walletId,
    })
    .from(walletMovement)
    .where(
      and(
        eq(walletMovement.lotId, values.lotId),
        eq(walletMovement.bidId, values.bidId),
        inArray(walletMovement.type, ["HOLD", "RELEASE"]),
      ),
    );
  const hold = rows.find((row) => row.type === "HOLD");
  const released = rows.some((row) => row.type === "RELEASE");

  if (hold === undefined || released || hold.walletId !== values.walletId) {
    return null;
  }

  return {
    amount: hold.amount,
  };
}

// bid_id stays null. HOLD and RELEASE are unique per bid; a settlement is
// unique per lot and type.
export async function insertSettlementMovement(
  executor: DatabaseExecutor,
  values: {
    walletId: string;
    type: "SETTLEMENT_DEBIT" | "SETTLEMENT_CREDIT";
    amount: string;
    lotId: string;
  },
) {
  return insertWalletMovement(executor, {
    walletId: values.walletId,
    type: values.type,
    amount: values.amount,
    lotId: values.lotId,
    bidId: null,
  });
}

function formatWalletMoney(value: string): string {
  const amount = formatMoney(value);
  if (amount === null) {
    throw new Error("Wallet query returned an unexpected amount");
  }
  return amount;
}

async function insertWalletMovement(
  executor: DatabaseExecutor,
  values: typeof walletMovement.$inferInsert,
) {
  const rows = await executor
    .insert(walletMovement)
    .values(values)
    .returning({ id: walletMovement.id });
  const row = rows[0];
  if (!row) {
    throw new Error("Insert wallet movement did not return a row");
  }
  return row;
}

async function updateWalletBalances(
  executor: DatabaseExecutor,
  walletId: string,
  changes: { totalBalance?: SQL; committedBalance?: SQL },
) {
  const rows = await executor
    .update(wallet)
    .set(changes)
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
