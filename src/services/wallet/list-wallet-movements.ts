//* Schemas imports
import type {
  ListWalletMovementsQuery,
  ListWalletMovementsResponse,
} from "../../schemas/wallet";

//* Models imports
import type { DatabaseExecutor } from "../../models/executor";
import {
  findWalletByUserId,
  listWalletMovementsByWalletId,
} from "../../models/wallet";

//* Local imports
import { db } from "../../db/index";

const listWalletMovementsErrorCodes = ["WALLET_NOT_FOUND"] as const;

export type ListWalletMovementsErrorCode =
  (typeof listWalletMovementsErrorCodes)[number];

export class ListWalletMovementsError extends Error {
  readonly code: ListWalletMovementsErrorCode;

  constructor(code: ListWalletMovementsErrorCode, message: string) {
    super(message);
    this.name = "ListWalletMovementsError";
    this.code = code;
  }
}

export type ListWalletMovementsInput = ListWalletMovementsQuery & {
  userId: string;
};

export type ListWalletMovementsDependencies = {
  executor: DatabaseExecutor;
};

export async function listWalletMovements(
  input: ListWalletMovementsInput,
  dependencies: ListWalletMovementsDependencies = createDefaultDependencies(),
): Promise<ListWalletMovementsResponse> {
  const row = await findWalletByUserId(dependencies.executor, input.userId);

  if (!row) {
    throw new ListWalletMovementsError(
      "WALLET_NOT_FOUND",
      "Wallet was not found.",
    );
  }

  const page = await listWalletMovementsByWalletId(
    dependencies.executor,
    row.id,
    {
      limit: input.limit,
      offset: (input.page - 1) * input.limit,
    },
  );

  return {
    movements: page.movements,
    page: input.page,
    limit: input.limit,
    total: page.total,
  };
}

function createDefaultDependencies(): ListWalletMovementsDependencies {
  return {
    executor: db,
  };
}
