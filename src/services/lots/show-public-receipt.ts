//* Libraries imports
import { asc, eq } from "drizzle-orm";

//* Schemas imports
import { formatListedMoney } from "../../schemas/money";

//* Local imports
import { db } from "../../db/index";
import { lot, lotItem, receipt } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";

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

export type ShownPublicReceiptItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
  cardSnapshot: Record<string, unknown>;
};

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

  const items = await loadItems(db, row.lotId);

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

function publicCardSnapshot(snapshot: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([key]) => key !== "card_images"),
  );
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

async function loadItems(executor: DatabaseExecutor, lotId: string) {
  return executor
    .select({
      id: lotItem.id,
      position: lotItem.position,
      cardId: lotItem.cardId,
      quantity: lotItem.quantity,
      cardName: lotItem.cardName,
      imagePath: lotItem.imagePath,
      cardSnapshot: lotItem.cardSnapshot,
    })
    .from(lotItem)
    .where(eq(lotItem.lotId, lotId))
    .orderBy(asc(lotItem.position));
}

function listedReceiptAmount(value: string): string {
  const listed = formatListedMoney(value);

  if (listed === null) {
    throw new Error("Receipt show returned an unexpected amount");
  }

  return listed;
}
