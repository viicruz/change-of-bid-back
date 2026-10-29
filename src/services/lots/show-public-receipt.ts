//* Libraries imports
import { eq } from "drizzle-orm";

//* Schemas imports
import { formatListedMoney } from "../../schemas/money";

//* Local imports
import { loadShownLotItems, publicCardSnapshot } from "./lot-read";
import { db } from "../../db/index";
import { lot, receipt } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import type { ShownLotItem } from "./lot-read-types";

const showPublicReceiptErrorCodes = ["RECEIPT_NOT_FOUND"] as const;

export type ShowPublicReceiptErrorCode =
  (typeof showPublicReceiptErrorCodes)[number];

export class ShowPublicReceiptError extends Error {
  readonly code: ShowPublicReceiptErrorCode;

  constructor(code: ShowPublicReceiptErrorCode, message: string) {
    super(message);
    this.name = "ShowPublicReceiptError";
    this.code = code;
  }
}

export type ShownPublicReceiptItem = ShownLotItem;

export type ShownPublicReceipt = {
  receipt: {
    lotId: string;
    title: string;
    description: string | null;
    endedAt: Date;
    finalAmount: string;
    winnerParticipantNo: number;
    items: ShownPublicReceiptItem[];
  };
};

export async function showPublicReceipt(
  shareToken: string,
): Promise<ShownPublicReceipt> {
  const row = await findReceipt(db, shareToken);

  if (row === null) {
    throw new ShowPublicReceiptError(
      "RECEIPT_NOT_FOUND",
      "Receipt was not found.",
    );
  }

  const items = await loadShownLotItems(db, row.lotId);

  return {
    receipt: {
      lotId: row.lotId,
      title: row.title,
      description: row.description,
      endedAt: row.endedAt,
      finalAmount: listedReceiptAmount(row.finalAmount),
      winnerParticipantNo: row.winnerParticipantNo,
      items: items.map((item) => ({
        ...item,
        cardSnapshot: publicCardSnapshot(item.cardSnapshot),
      })),
    },
  };
}

async function findReceipt(executor: DatabaseExecutor, shareToken: string) {
  const rows = await executor
    .select({
      lotId: receipt.lotId,
      title: lot.title,
      description: lot.description,
      endedAt: receipt.endedAt,
      finalAmount: receipt.finalAmount,
      winnerParticipantNo: receipt.winnerParticipantNo,
    })
    .from(receipt)
    .innerJoin(lot, eq(lot.id, receipt.lotId))
    .where(eq(receipt.shareToken, shareToken));

  return rows[0] ?? null;
}

function listedReceiptAmount(value: string): string {
  const listed = formatListedMoney(value);

  if (listed === null) {
    throw new Error("Receipt show returned an unexpected amount");
  }

  return listed;
}
