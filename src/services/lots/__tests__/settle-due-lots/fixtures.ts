//* Libraries imports
import { inArray } from "drizzle-orm";

//* Local imports
import { db } from "../../../../db/index";
import {
  bid,
  lot,
  lotParticipant,
  receipt,
  user,
  wallet,
  walletMovement,
} from "../../../../db/schema";
import { cancelLot } from "../../cancel-lot";
import { placeBid } from "../../place-bid";
import { LotSettlementError, settleDueLots } from "../../settle-due-lots";
export const clock = new Date("1999-06-15T12:00:00.000Z");
export const hour = 60 * 60 * 1000;
export const minute = 60 * 1000;
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];

export function shift(base: Date, milliseconds: number) {
  return new Date(base.getTime() + milliseconds);
}

export function placeFor(userId: string, lotId: string, amount: string, at: Date) {
  return placeBid(
    {
      lotId,
      userId,
      role: "BIDDER",
      amount,
    },
    { now: () => at },
  );
}

export function settleFor(at: Date) {
  return settleDueLots({ now: () => at });
}

export function cancelFor(auctioneerId: string, lotId: string, at: Date) {
  return cancelLot(
    {
      lotId,
      auctioneerId,
      role: "AUCTIONEER",
    },
    { now: () => at },
  );
}

export async function settle<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (error: unknown) => ({ status: "rejected" as const, error }),
  );
}

export async function insertUser(role: "AUCTIONEER" | "BIDDER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Settlement Tester",
    email: `settle-${id}@example.com`,
    role,
  });
  createdUserIds.push(id);

  return id;
}

export async function insertWallet(
  userId: string,
  totalBalance: string,
  committedBalance = "0.00",
) {
  const rows = await db
    .insert(wallet)
    .values({
      userId,
      totalBalance,
      committedBalance,
    })
    .returning({ id: wallet.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert wallet did not return a row");
  }

  return row.id;
}

async function insertLot(
  auctioneerId: string,
  values: {
    startsAt: Date;
    endsAt: Date;
    openingBid?: string;
    minIncrement?: string;
  },
) {
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Settlement lot",
      description: null,
      openingBid: values.openingBid ?? "10.00",
      minIncrement: values.minIncrement ?? "0.50",
      startsAt: values.startsAt,
      originalEndsAt: values.endsAt,
      endsAt: values.endsAt,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  return row.id;
}

export async function openLot(
  values: {
    startsAt?: Date;
    endsAt?: Date;
    openingBid?: string;
    minIncrement?: string;
  } = {},
) {
  const auctioneerId = await insertUser("AUCTIONEER");
  const auctioneerWalletId = await insertWallet(auctioneerId, "0.00");
  const startsAt = values.startsAt ?? shift(clock, -2 * hour);
  const endsAt = values.endsAt ?? shift(clock, 2 * hour);
  const lotId = await insertLot(auctioneerId, {
    startsAt,
    endsAt,
    openingBid: values.openingBid,
    minIncrement: values.minIncrement,
  });

  return { auctioneerId, auctioneerWalletId, lotId, startsAt, endsAt };
}

export async function leadLot(
  lotId: string,
  amount: string,
  at: Date,
  totalBalance = "100.00",
) {
  const bidderId = await insertUser("BIDDER");
  const walletId = await insertWallet(bidderId, totalBalance);
  const accepted = await placeFor(bidderId, lotId, amount, at);

  return { bidderId, walletId, accepted };
}

export function forLot<Row extends { lotId: string }>(rows: Row[], lotId: string) {
  return rows.filter((row) => row.lotId === lotId);
}

export function settlementError(error: unknown, lotId: string) {
  if (!(error instanceof AggregateError)) {
    return undefined;
  }

  return error.errors.find(
    (entry): entry is LotSettlementError =>
      entry instanceof LotSettlementError && entry.lotId === lotId,
  );
}

export async function cleanup() {
  const wallets =
    createdUserIds.length === 0
      ? []
      : await db
          .select({ id: wallet.id })
          .from(wallet)
          .where(inArray(wallet.userId, createdUserIds));
  const walletIds = wallets.map((entry) => entry.id);

  if (walletIds.length > 0) {
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.walletId, walletIds));
  }

  if (createdLotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, createdLotIds));
    await db.delete(receipt).where(inArray(receipt.lotId, createdLotIds));
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.lotId, createdLotIds));
    await db.delete(bid).where(inArray(bid.lotId, createdLotIds));
    await db
      .delete(lotParticipant)
      .where(inArray(lotParticipant.lotId, createdLotIds));
    await db.delete(lot).where(inArray(lot.id, createdLotIds));
  }

  if (walletIds.length > 0) {
    await db.delete(wallet).where(inArray(wallet.id, walletIds));
  }

  if (createdUserIds.length > 0) {
    await db.delete(user).where(inArray(user.id, createdUserIds));
  }

  createdLotIds.length = 0;
  createdUserIds.length = 0;
}
