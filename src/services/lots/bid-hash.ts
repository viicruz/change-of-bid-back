//* Libraries imports
import { createHmac } from "node:crypto";

const GENESIS_LABEL = "genesis";
const CANONICAL_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function canonicalBidTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error("Bid timestamp is invalid");
  }

  const canonical = value.toISOString();

  if (!CANONICAL_TIMESTAMP.test(canonical)) {
    throw new Error("Bid timestamp is not canonical");
  }

  return canonical;
}

export function genesisBidHash(secret: string, lotId: string): string {
  return signBidHash(secret, `${GENESIS_LABEL}|${lotId}`);
}

export function chainBidHash(
  secret: string,
  fields: {
    previousHash: string;
    lotId: string;
    sequence: number;
    participantNo: number;
    amount: string;
    createdAt: string;
  },
): string {
  return signBidHash(
    secret,
    [
      fields.previousHash,
      fields.lotId,
      String(fields.sequence),
      String(fields.participantNo),
      fields.amount,
      fields.createdAt,
    ].join("|"),
  );
}

function signBidHash(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}
