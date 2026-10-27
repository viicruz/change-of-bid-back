//* Libraries imports
import { sql } from "drizzle-orm";

//* Local imports
import { lot } from "../../db/schema";

export function isCanceled() {
  return sql`(${lot.status} = 'CANCELED')`;
}

export function isEnded(now: Date) {
  return sql`(${lot.status} = 'ENDED' OR (${lot.status} = 'ACTIVE' AND ${lot.endsAt} <= ${now}))`;
}

export function isScheduled(now: Date) {
  return sql`(${lot.status} = 'ACTIVE' AND ${lot.startsAt} > ${now})`;
}

export function isLive(now: Date) {
  return sql`(${lot.status} = 'ACTIVE' AND ${lot.startsAt} <= ${now} AND ${lot.endsAt} > ${now})`;
}
