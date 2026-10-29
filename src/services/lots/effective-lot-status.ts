//* Libraries imports
import { sql } from "drizzle-orm";

//* Local imports
import { lot } from "../../db/schema";

export function isCanceled() {
  return sql`(${lot.status} = 'CANCELED')`;
}

// Active lots whose current end has passed. Live treats ends_at as exclusive,
// so this is the same boundary isEnded uses for a lot the job still has to close.
export function isDueForSettlement(now: Date) {
  return sql`(${lot.status} = 'ACTIVE' AND ${lot.endsAt} <= ${now})`;
}

export function isEnded(now: Date) {
  return sql`(${lot.status} = 'ENDED' OR ${isDueForSettlement(now)})`;
}

export function isScheduled(now: Date) {
  return sql`(${lot.status} = 'ACTIVE' AND ${lot.startsAt} > ${now})`;
}

export function isLive(now: Date) {
  return sql`(${lot.status} = 'ACTIVE' AND ${lot.startsAt} <= ${now} AND ${lot.endsAt} > ${now})`;
}

export function effectiveLotStatus(now: Date) {
  return sql<string | null>`CASE
    WHEN ${isCanceled()} THEN 'CANCELED'
    WHEN ${isEnded(now)} THEN 'ENDED'
    WHEN ${isScheduled(now)} THEN 'SCHEDULED'
    WHEN ${isLive(now)} THEN 'LIVE'
  END`.as("effective_status");
}
