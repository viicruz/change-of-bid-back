//* Schemas imports
import { moneyValidationMessage, normalizeMoney } from "../../schemas/money";
import type { WalletResponse } from "../../schemas/wallet";

//* Models imports
import type { DatabaseExecutor } from "../../models/executor";
import {
  findWalletByUserId,
  increaseTotalBalance,
  insertDepositMovement,
  lockWalletByUserId,
} from "../../models/wallet";

//* Local imports
import { db } from "../../db/index";

const depositErrorCodes = [
  "NOT_BIDDER",
  "WALLET_NOT_FOUND",
  "INVALID_MONEY",
  "AMOUNT_OUT_OF_RANGE",
] as const;

const numericOutOfRangeCode = "22003";

export type DepositErrorCode = (typeof depositErrorCodes)[number];

export class DepositError extends Error {
  readonly code: DepositErrorCode;

  constructor(code: DepositErrorCode, message: string) {
    super(message);
    this.name = "DepositError";
    this.code = code;
  }
}

export type DepositInput = {
  userId: string;
  role: string;
  amount: unknown;
};

export type DepositDependencies = {
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
  lockWalletByUserId: typeof lockWalletByUserId;
  insertDepositMovement: typeof insertDepositMovement;
  increaseTotalBalance: typeof increaseTotalBalance;
  findWalletByUserId: typeof findWalletByUserId;
};

export async function deposit(
  input: DepositInput,
  dependencies: Partial<DepositDependencies> = {},
): Promise<WalletResponse> {
  const resolved = {
    ...createDefaultDependencies(),
    ...dependencies,
  };
  const amount = validateDepositInput(input);

  try {
    return await resolved.runInTransaction((executor) =>
      persistDeposit(executor, input.userId, amount, resolved),
    );
  } catch (error) {
    if (error instanceof DepositError) {
      throw error;
    }

    if (isNumericOutOfRange(error)) {
      throw new DepositError(
        "AMOUNT_OUT_OF_RANGE",
        "The deposit exceeds the wallet balance limit.",
      );
    }

    throw error;
  }
}

function validateDepositInput(input: DepositInput): string {
  if (input.role !== "BIDDER") {
    throw new DepositError(
      "NOT_BIDDER",
      "Only a bidder can deposit into a wallet.",
    );
  }

  if (typeof input.amount !== "string") {
    throw new DepositError("INVALID_MONEY", moneyValidationMessage);
  }

  const amount = normalizeMoney(input.amount);

  if (amount === null) {
    throw new DepositError("INVALID_MONEY", moneyValidationMessage);
  }

  return amount;
}

// Lock, movement, credit, and balance read all use the same transaction.
async function persistDeposit(
  executor: DatabaseExecutor,
  userId: string,
  amount: string,
  dependencies: DepositDependencies,
): Promise<WalletResponse> {
  const locked = await dependencies.lockWalletByUserId(executor, userId);

  if (locked === null) {
    throw new DepositError("WALLET_NOT_FOUND", "Wallet was not found.");
  }

  await dependencies.insertDepositMovement(executor, {
    walletId: locked.id,
    amount,
  });
  await dependencies.increaseTotalBalance(executor, locked.id, amount);

  const updated = await dependencies.findWalletByUserId(executor, userId);

  if (updated === null) {
    throw new Error("Wallet was not found after deposit");
  }

  return {
    totalBalance: updated.totalBalance,
    committedBalance: updated.committedBalance,
    availableBalance: updated.availableBalance,
  };
}

function createDefaultDependencies(): DepositDependencies {
  return {
    runInTransaction: (work) => db.transaction((tx) => work(tx)),
    lockWalletByUserId,
    insertDepositMovement,
    increaseTotalBalance,
    findWalletByUserId,
  };
}

function isNumericOutOfRange(error: unknown): boolean {
  let current: unknown = error;

  while (isRecord(current)) {
    if (current.code === numericOutOfRangeCode) {
      return true;
    }

    if (!(current instanceof Error)) {
      return false;
    }

    current = current.cause;
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
