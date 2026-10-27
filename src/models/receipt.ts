//* Local imports
import { receipt } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export async function insertReceipt(
  executor: DatabaseExecutor,
  values: {
    lotId: string;
    winningBidId: string;
    winnerId: string;
    winnerParticipantNo: number;
    finalAmount: string;
    endedAt: Date;
    shareToken: string;
  },
) {
  const rows = await executor
    .insert(receipt)
    .values(values)
    .returning({
      id: receipt.id,
      lotId: receipt.lotId,
      winningBidId: receipt.winningBidId,
      winnerId: receipt.winnerId,
      winnerParticipantNo: receipt.winnerParticipantNo,
      finalAmount: receipt.finalAmount,
      endedAt: receipt.endedAt,
      shareToken: receipt.shareToken,
    });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert receipt did not return a row");
  }

  return row;
}
