//* Libraries imports
import { and, eq, max } from "drizzle-orm";

//* Local imports
import { lotParticipant } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

export async function findLotParticipantByUserId(
  executor: DatabaseExecutor,
  lotId: string,
  userId: string,
) {
  const rows = await executor
    .select({
      id: lotParticipant.id,
      participantNo: lotParticipant.participantNo,
    })
    .from(lotParticipant)
    .where(
      and(eq(lotParticipant.lotId, lotId), eq(lotParticipant.userId, userId)),
    )
    .limit(1);

  return rows[0] ?? null;
}

// The caller holds the lot row lock, so the next participant number is stable.
export async function findOrCreateLotParticipant(
  executor: DatabaseExecutor,
  lotId: string,
  userId: string,
) {
  const existing = await executor
    .select({
      id: lotParticipant.id,
      participantNo: lotParticipant.participantNo,
    })
    .from(lotParticipant)
    .where(
      and(eq(lotParticipant.lotId, lotId), eq(lotParticipant.userId, userId)),
    )
    .limit(1);
  const found = existing[0];

  if (found) {
    return found;
  }

  const maxRows = await executor
    .select({
      maxParticipantNo: max(lotParticipant.participantNo),
    })
    .from(lotParticipant)
    .where(eq(lotParticipant.lotId, lotId));
  const participantNo = Number(maxRows[0]?.maxParticipantNo ?? 0) + 1;

  if (!Number.isInteger(participantNo) || participantNo < 1) {
    throw new Error("Lot participant number is invalid");
  }

  const inserted = await executor
    .insert(lotParticipant)
    .values({
      lotId,
      userId,
      participantNo,
    })
    .returning({
      id: lotParticipant.id,
      participantNo: lotParticipant.participantNo,
    });
  const row = inserted[0];

  if (!row) {
    throw new Error("Insert lot participant did not return a row");
  }

  return row;
}
