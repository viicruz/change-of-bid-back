//* Libraries imports
import { and, asc, eq } from "drizzle-orm";

//* Local imports
import { lot } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

//* Services imports
import { isDueForSettlement } from "../services/lots/effective-lot-status";

export async function listDueLotIds(executor: DatabaseExecutor, now: Date) {
  const rows = await executor
    .select({ id: lot.id })
    .from(lot)
    .where(isDueForSettlement(now))
    .orderBy(asc(lot.endsAt), asc(lot.id));

  return rows.map((row) => row.id);
}

export async function insertLot(
  executor: DatabaseExecutor,
  values: typeof lot.$inferInsert,
) {
  const rows = await executor.insert(lot).values(values).returning();
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  return row;
}

export async function lockLotForUpdate(
  executor: DatabaseExecutor,
  lotId: string,
) {
  const rows = await executor
    .select()
    .from(lot)
    .where(eq(lot.id, lotId))
    .for("update");

  return rows[0] ?? null;
}

export async function markLotCanceled(
  executor: DatabaseExecutor,
  lotId: string,
  canceledAt: Date,
) {
  const rows = await executor
    .update(lot)
    .set({
      status: "CANCELED",
      canceledAt,
    })
    .where(and(eq(lot.id, lotId), eq(lot.status, "ACTIVE")))
    .returning({
      id: lot.id,
      status: lot.status,
      canceledAt: lot.canceledAt,
    });
  const row = rows[0];

  if (!row || row.canceledAt === null || row.status !== "CANCELED") {
    throw new Error("Cancel lot did not return a row");
  }

  return {
    id: row.id,
    status: row.status,
    canceledAt: row.canceledAt,
  };
}

export async function markLotLeadingBid(
  executor: DatabaseExecutor,
  lotId: string,
  values: {
    currentBidId: string;
    bidCount: number;
    headHash: string;
    schedule?: {
      endsAt: Date;
      extensionCount: number;
    };
  },
) {
  const rows = await executor
    .update(lot)
    .set({
      currentBidId: values.currentBidId,
      bidCount: values.bidCount,
      headHash: values.headHash,
      ...(values.schedule === undefined
        ? {}
        : {
            endsAt: values.schedule.endsAt,
            extensionCount: values.schedule.extensionCount,
          }),
    })
    .where(and(eq(lot.id, lotId), eq(lot.status, "ACTIVE")))
    .returning({
      id: lot.id,
      currentBidId: lot.currentBidId,
      bidCount: lot.bidCount,
      headHash: lot.headHash,
      endsAt: lot.endsAt,
      extensionCount: lot.extensionCount,
    });
  const row = rows[0];

  if (
    !row ||
    row.currentBidId === null ||
    row.headHash === null
  ) {
    throw new Error("Leading bid update did not return a row");
  }

  return {
    id: row.id,
    currentBidId: row.currentBidId,
    bidCount: row.bidCount,
    headHash: row.headHash,
    endsAt: row.endsAt,
    extensionCount: row.extensionCount,
  };
}

export async function markLotEnded(
  executor: DatabaseExecutor,
  lotId: string,
  values: {
    winnerId: string | null;
    endedAt: Date;
    settledAt: Date;
  },
) {
  const rows = await executor
    .update(lot)
    .set({
      status: "ENDED",
      winnerId: values.winnerId,
      endedAt: values.endedAt,
      settledAt: values.settledAt,
    })
    .where(and(eq(lot.id, lotId), eq(lot.status, "ACTIVE")))
    .returning({
      id: lot.id,
      status: lot.status,
      winnerId: lot.winnerId,
      endedAt: lot.endedAt,
      settledAt: lot.settledAt,
    });
  const row = rows[0];

  if (
    !row ||
    row.status !== "ENDED" ||
    row.winnerId !== values.winnerId ||
    row.endedAt === null ||
    row.settledAt === null
  ) {
    throw new Error("End lot did not return a row");
  }

  return {
    id: row.id,
    status: row.status,
    winnerId: row.winnerId,
    endedAt: row.endedAt,
    settledAt: row.settledAt,
  };
}
