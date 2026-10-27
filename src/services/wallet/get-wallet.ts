//* Schemas imports
import type { WalletResponse } from "../../schemas/wallet";

//* Models imports
import type { DatabaseExecutor } from "../../models/executor";
import { findWalletByUserId } from "../../models/wallet";

//* Local imports
import { db } from "../../db/index";

const getWalletErrorCodes = ["WALLET_NOT_FOUND"] as const;

export type GetWalletErrorCode = (typeof getWalletErrorCodes)[number];

export class GetWalletError extends Error {
  readonly code: GetWalletErrorCode;

  constructor(code: GetWalletErrorCode, message: string) {
    super(message);
    this.name = "GetWalletError";
    this.code = code;
  }
}

export type GetWalletInput = {
  userId: string;
};

export type GetWalletDependencies = {
  executor: DatabaseExecutor;
};

export async function getWallet(
  input: GetWalletInput,
  dependencies: GetWalletDependencies = createDefaultDependencies(),
): Promise<WalletResponse> {
  const row = await findWalletByUserId(dependencies.executor, input.userId);

  if (!row) {
    throw new GetWalletError("WALLET_NOT_FOUND", "Wallet was not found.");
  }

  return {
    totalBalance: row.totalBalance,
    committedBalance: row.committedBalance,
    availableBalance: row.availableBalance,
  };
}

function createDefaultDependencies(): GetWalletDependencies {
  return {
    executor: db,
  };
}
