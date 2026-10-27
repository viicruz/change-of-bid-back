//* Libraries imports
import { eq } from "drizzle-orm";

//* Local imports
import { bid } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export async function findBidById(executor: DatabaseExecutor, bidId: string) {
  const rows = await executor
    .select({
      id: bid.id,
      lotId: bid.lotId,
      bidderId: bid.bidderId,
      amount: bid.amount,
      sequence: bid.sequence,
      previousHash: bid.previousHash,
      hash: bid.hash,
    })
    .from(bid)
    .where(eq(bid.id, bidId));

  return rows[0] ?? null;
}

export async function insertBid(
  executor: DatabaseExecutor,
  values: {
    lotId: string;
    participantId: string;
    bidderId: string;
    sequence: number;
    amount: string;
    createdAt: Date;
    previousHash: string;
    hash: string;
  },
) {
  const rows = await executor
    .insert(bid)
    .values(values)
    .returning({
      id: bid.id,
      sequence: bid.sequence,
      amount: bid.amount,
      createdAt: bid.createdAt,
    });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert bid did not return a row");
  }

  return row;
}
