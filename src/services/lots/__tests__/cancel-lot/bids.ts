//* Libraries imports
import { eq } from "drizzle-orm";

//* Local imports
import { db } from "../../../../db/index";
import { bid, lot, lotParticipant, walletMovement } from "../../../../db/schema";
import { insertLot, insertUser, insertWallet, now } from "./fixtures";

export type LeadingBid = {
  bidderId: string;
  bidId: string;
  walletId: string;
};

type AcceptedBidValues = {
  bidderId: string;
  walletId: string;
  amount: string;
  participantNo: number;
  sequence: number;
  released: boolean;
  leading: boolean;
};

export async function attachLeadingBid(
  lotId: string,
  amount: string,
): Promise<LeadingBid> {
  const bidderId = await insertUser("BIDDER");
  const participantId = await insertParticipant(lotId, bidderId, 1);
  const bidId = await insertBid({
    lotId,
    participantId,
    bidderId,
    sequence: 1,
    amount,
    previousHash: "genesis",
    hash: "hash-1",
  });

  await setLotHead(lotId, {
    currentBidId: bidId,
    bidCount: 1,
    headHash: "hash-1",
  });

  const walletId = await insertWallet(bidderId, "100.00", amount);

  await db.insert(walletMovement).values({
    walletId,
    type: "HOLD",
    amount,
    lotId,
    bidId,
  });

  return {
    bidderId,
    bidId,
    walletId,
  };
}

// Inserts the auctioneer, the lot and a leader seeded by attachLeadingBid.
export async function insertLotWithLeader(
  schedule: { startsAt: Date; endsAt: Date },
  amount: string,
) {
  const auctioneerId = await insertUser("AUCTIONEER");
  const lotId = await insertLot(auctioneerId, schedule);
  const leader = await attachLeadingBid(lotId, amount);

  return { auctioneerId, lotId, leader };
}

export async function insertAcceptedBid(
  lotId: string,
  values: AcceptedBidValues,
) {
  const participantId = await insertParticipant(
    lotId,
    values.bidderId,
    values.participantNo,
  );
  const bidId = await insertBid({
    lotId,
    participantId,
    bidderId: values.bidderId,
    sequence: values.sequence,
    amount: values.amount,
    previousHash: `genesis-${values.sequence}`,
    hash: `hash-${values.sequence}`,
    createdAt: new Date(now.getTime() + values.sequence * 1000),
  });

  if (values.leading) {
    await setLotHead(lotId, {
      currentBidId: bidId,
      bidCount: values.sequence,
      headHash: `hash-${values.sequence}`,
    });
  }

  await insertAcceptedBidMovements(lotId, bidId, values);

  return {
    bidId,
  };
}

async function insertAcceptedBidMovements(
  lotId: string,
  bidId: string,
  values: AcceptedBidValues,
) {
  await db.insert(walletMovement).values({
    walletId: values.walletId,
    type: "HOLD",
    amount: values.amount,
    lotId,
    bidId,
    createdAt: new Date(now.getTime() + values.sequence * 1000),
  });

  if (values.released) {
    await db.insert(walletMovement).values({
      walletId: values.walletId,
      type: "RELEASE",
      amount: values.amount,
      lotId,
      bidId,
      createdAt: new Date(now.getTime() + values.sequence * 1000 + 1),
    });
  }
}

async function insertParticipant(
  lotId: string,
  userId: string,
  participantNo: number,
) {
  const participants = await db
    .insert(lotParticipant)
    .values({
      lotId,
      userId,
      participantNo,
    })
    .returning({ id: lotParticipant.id });
  const participant = participants[0];

  if (!participant) {
    throw new Error("Insert participant did not return a row");
  }

  return participant.id;
}

async function insertBid(values: typeof bid.$inferInsert) {
  const bids = await db
    .insert(bid)
    .values(values)
    .returning({ id: bid.id });
  const createdBid = bids[0];

  if (!createdBid) {
    throw new Error("Insert bid did not return a row");
  }

  return createdBid.id;
}

async function setLotHead(
  lotId: string,
  head: { currentBidId: string; bidCount: number; headHash: string },
) {
  await db.update(lot).set(head).where(eq(lot.id, lotId));
}
