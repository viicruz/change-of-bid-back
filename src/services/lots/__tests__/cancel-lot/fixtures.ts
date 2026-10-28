//* Libraries imports
import { inArray } from "drizzle-orm";

//* Local imports
import { db } from "../../../../db/index";
import {
  bid,
  lot,
  lotParticipant,
  user,
  wallet,
  walletMovement,
} from "../../../../db/schema";
import { cancelLot } from "../../cancel-lot";

export const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];

export function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function cancelFor(
  auctioneerId: string,
  lotId: string,
  role: "AUCTIONEER" | "BIDDER" = "AUCTIONEER",
) {
  return cancelLot(
    {
      lotId,
      auctioneerId,
      role,
    },
    { now: () => now },
  );
}

export async function insertUser(role: "AUCTIONEER" | "BIDDER") {
  const id = crypto.randomUUID();

  await db.insert(user).values({
    id,
    name: "Cancel Tester",
    email: `cancel-${id}@example.com`,
    role,
  });
  createdUserIds.push(id);

  return id;
}

export async function insertLot(
  auctioneerId: string,
  values: {
    startsAt: Date;
    endsAt: Date;
    status?: "ACTIVE" | "ENDED" | "CANCELED";
    winnerId?: string;
    canceledAt?: Date;
  },
) {
  const status = values.status ?? "ACTIVE";
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Cancelable lot",
      description: null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt: values.startsAt,
      originalEndsAt: values.endsAt,
      endsAt: values.endsAt,
      status,
      winnerId: values.winnerId ?? null,
      endedAt: status === "ENDED" ? values.endsAt : null,
      canceledAt: status === "CANCELED" ? (values.canceledAt ?? now) : null,
    })
    .returning({ id: lot.id });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  return row.id;
}

export async function insertWallet(
  userId: string,
  totalBalance: string,
  committedBalance: string,
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
