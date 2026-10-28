//* Libraries imports
import { eq } from "drizzle-orm";

//* Schemas imports
import { formatListedMoney, normalizeMoney } from "../../schemas/money";
import type { ShowPublicLotAuditStatus } from "../../schemas/show-lot-audit";

//* Local imports
import { loadShownLotBids } from "./lot-read";
import { db } from "../../db/index";
import { lot } from "../../db/schema";
import { env } from "../../env";
import type { DatabaseExecutor } from "../../models/executor";

//* Services imports
import {
  canonicalBidTimestamp,
  chainBidHash,
  genesisBidHash,
} from "./bid-hash";

// The accepted-bid HMAC key is at least 32 characters. A shorter key cannot
// prove the chain, so verification stops before any comparison.
const MINIMUM_BID_HASH_SECRET_LENGTH = 32;

const showPublicLotAuditErrorCodes = ["LOT_NOT_FOUND"] as const;

export type ShowPublicLotAuditErrorCode =
  (typeof showPublicLotAuditErrorCodes)[number];

export class ShowPublicLotAuditError extends Error {
  readonly code: ShowPublicLotAuditErrorCode;

  constructor(code: ShowPublicLotAuditErrorCode, message: string) {
    super(message);
    this.name = "ShowPublicLotAuditError";
    this.code = code;
  }
}

export type ShownPublicLotAuditBid = {
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
};

export type ShownPublicLotAudit = {
  audit: {
    lotId: string;
    status: ShowPublicLotAuditStatus;
    bids: ShownPublicLotAuditBid[];
  };
};

export type ShowPublicLotAuditDependencies = {
  hashSecret: string;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
};

type StoredAuditBid = {
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
  previousHash: string;
  hash: string;
};

export async function showPublicLotAudit(
  lotId: string,
  dependencies: Partial<ShowPublicLotAuditDependencies> = {},
): Promise<ShownPublicLotAudit> {
  const resolved: ShowPublicLotAuditDependencies = {
    ...createDefaultDependencies(),
    ...dependencies,
  };

  return resolved.runInTransaction(async (executor) => {
    const row = await findLotAnchor(executor, lotId);

    if (row === null) {
      throw new ShowPublicLotAuditError("LOT_NOT_FOUND", "Lot was not found.");
    }

    const storedBids = await loadShownLotBids(executor, lotId);
    const bids = storedBids.map(toPublicBid);
    const status = canVerifyHashChain(resolved.hashSecret)
      ? verifyChain(
          resolved.hashSecret,
          row.id,
          row.bidCount,
          row.headHash,
          storedBids,
        )
      : "VERIFICATION_FAILED";

    return {
      audit: {
        lotId: row.id,
        status,
        bids,
      },
    };
  });
}

function createDefaultDependencies(): ShowPublicLotAuditDependencies {
  return {
    hashSecret: env.BID_HASH_SECRET,
    runInTransaction: runShowPublicLotAuditRead,
  };
}

function runShowPublicLotAuditRead<Result>(
  work: (executor: DatabaseExecutor) => Promise<Result>,
): Promise<Result> {
  return db.transaction((executor) => work(executor), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

function canVerifyHashChain(secret: string): secret is string {
  return (
    typeof secret === "string" &&
    secret.length >= MINIMUM_BID_HASH_SECRET_LENGTH
  );
}

function verifyChain(
  secret: string,
  lotId: string,
  bidCount: number,
  headHash: string | null,
  rows: StoredAuditBid[],
): "INTACT" | "TAMPERED" {
  try {
    if (rows.length === 0) {
      return bidCount === 0 && headHash === null ? "INTACT" : "TAMPERED";
    }

    if (rows.length !== bidCount) {
      return "TAMPERED";
    }

    for (let index = 0; index < rows.length; index += 1) {
      if (rows[index]?.sequence !== index + 1) {
        return "TAMPERED";
      }
    }

    const first = rows[0];

    if (
      first === undefined ||
      first.previousHash !== genesisBidHash(secret, lotId)
    ) {
      return "TAMPERED";
    }

    for (let index = 1; index < rows.length; index += 1) {
      const current = rows[index];
      const previous = rows[index - 1];

      if (
        current === undefined ||
        previous === undefined ||
        current.previousHash !== previous.hash
      ) {
        return "TAMPERED";
      }
    }

    for (const row of rows) {
      const amount = normalizeMoney(row.amount);

      if (amount === null) {
        return "TAMPERED";
      }

      let createdAt: string;

      try {
        createdAt = canonicalBidTimestamp(row.createdAt);
      } catch {
        return "TAMPERED";
      }

      const expectedHash = chainBidHash(secret, {
        previousHash: row.previousHash,
        lotId,
        sequence: row.sequence,
        participantNo: row.participantNo,
        amount,
        createdAt,
      });

      if (row.hash !== expectedHash) {
        return "TAMPERED";
      }
    }

    const last = rows[rows.length - 1];

    if (last === undefined || last.hash !== headHash) {
      return "TAMPERED";
    }

    return "INTACT";
  } catch {
    return "TAMPERED";
  }
}

// A stored amount that cannot be listed stays in the response.
// It does not fail the request.
function toPublicBid(row: StoredAuditBid): ShownPublicLotAuditBid {
  return {
    sequence: row.sequence,
    amount: formatListedMoney(row.amount) ?? row.amount,
    createdAt: row.createdAt,
    participantNo: row.participantNo,
  };
}

async function findLotAnchor(executor: DatabaseExecutor, lotId: string) {
  const rows = await executor
    .select({
      id: lot.id,
      bidCount: lot.bidCount,
      headHash: lot.headHash,
    })
    .from(lot)
    .where(eq(lot.id, lotId));

  return rows[0] ?? null;
}
