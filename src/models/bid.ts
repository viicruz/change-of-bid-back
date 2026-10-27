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
