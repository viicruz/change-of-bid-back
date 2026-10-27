//* Libraries imports
import { and, eq } from "drizzle-orm";

//* Local imports
import { lot } from "../db/schema";
import type { DatabaseExecutor } from "./executor";

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
