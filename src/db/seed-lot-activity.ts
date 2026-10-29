//* Libraries imports
import { and, eq } from "drizzle-orm";

//* Local imports
import { db } from "./index";
import type { DatabaseExecutor } from "../models/executor";
import { env } from "../env";
import type { SeededLot } from "./seed-lots";
import {
  bidAmountForStep,
  bidInstants,
  depositInstants,
  seedDepositAmounts,
  type SeedBidder,
} from "./seed-lot-plan";
import { findSeedUserByEmail } from "./seed-user-lookup";
import { bid, lot, wallet, walletMovement } from "./schema";

//* Schemas imports
import { normalizeMoney } from "../schemas/money";

//* Services imports
import {
  canonicalBidTimestamp,
  chainBidHash,
  genesisBidHash,
} from "../services/lots/bid-hash";
import { cancelLot } from "../services/lots/cancel-lot";
import { placeBid, type AcceptedBid } from "../services/lots/place-bid";
import { settleDueLots } from "../services/lots/settle-due-lots";
import { deposit } from "../services/wallet/deposit";

export async function seedLotActivity(
  input: {
    auctioneerEmail: string;
    bidderEmails: Record<SeedBidder, string>;
    lots: SeededLot[];
    now?: Date;
  },
  dependencies: { settleDueLots?: typeof settleDueLots } = {},
) {
  const now = input.now ?? new Date();
  const bidderIds: Record<SeedBidder, string> = {
    bidder: await findUserId(input.bidderEmails.bidder),
    bidder2: await findUserId(input.bidderEmails.bidder2),
  };

  await seedDeposits(bidderIds.bidder, input.bidderEmails.bidder, now);
  await seedDeposits(bidderIds.bidder2, input.bidderEmails.bidder2, now);

  for (const seeded of input.lots) {
    await placePlannedBids(bidderIds, seeded, now);
  }

  await closeEndedLots(input.lots);
  await settleEndedLots(
    input.lots,
    now,
    dependencies.settleDueLots ?? settleDueLots,
  );
  await cancelSeededLots(input.auctioneerEmail, input.lots);
}

async function seedDeposits(userId: string, email: string, now: Date) {
  const existing = await seedDepositsQuery(userId).limit(1);

  if (existing.length > 0) {
    console.log(`skipped deposits for ${email}`);
    return;
  }

  for (const amount of seedDepositAmounts) {
    await deposit({
      userId,
      role: "BIDDER",
      amount,
    });
    console.log(`deposited ${amount} for ${email}`);
  }

  await retimeDeposits(userId, now);
}

async function retimeDeposits(userId: string, now: Date) {
  const rows = await seedDepositsQuery(userId);
  const instants = depositInstants(now);

  for (const [index, amount] of seedDepositAmounts.entries()) {
    const createdAt = instants[index];
    const row = rows.find((entry) => normalizeMoney(entry.amount) === amount);

    if (!row || !createdAt) {
      throw new Error(`Deposit ${amount} for ${userId} was not stored`);
    }

    await db
      .update(walletMovement)
      .set({ createdAt })
      .where(eq(walletMovement.id, row.id));
  }
}

async function placePlannedBids(
  bidderIds: Record<SeedBidder, string>,
  seeded: SeededLot,
  now: Date,
) {
  const placed: AcceptedBid[] = [];

  for (const [step, bidderKey] of seeded.plan.bids.entries()) {
    const userId = bidderIds[bidderKey];
    const accepted = await placeBid({
      lotId: seeded.id,
      userId,
      role: "BIDDER",
      amount: bidAmountForStep(seeded.plan.openingBid, step),
    });

    if (accepted.extensionCount !== 0) {
      throw new Error(`Bid on ${seeded.title} extended the lot`);
    }

    placed.push(accepted);
    console.log(`bid ${accepted.amount} on ${seeded.title}`);
  }

  if (placed.length === 0) {
    return;
  }

  await retimeBids(
    seeded.id,
    placed,
    bidInstants(seeded.plan.startsAt, seeded.plan.endsAt, placed.length, now),
  );
}

async function retimeBids(
  lotId: string,
  placed: AcceptedBid[],
  instants: Date[],
) {
  if (instants.length !== placed.length) {
    throw new Error("Bid instant count does not match the placed bids");
  }

  await db.transaction(async (tx) => {
    let previousHash = genesisBidHash(env.BID_HASH_SECRET, lotId);

    for (const [index, placedBid] of placed.entries()) {
      const createdAt = instants[index];

      if (!createdAt) {
        throw new Error("Bid instant is missing");
      }

      const hash = chainBidHash(env.BID_HASH_SECRET, {
        previousHash,
        lotId,
        sequence: placedBid.sequence,
        participantNo: placedBid.participantNo,
        amount: placedBid.amount,
        createdAt: canonicalBidTimestamp(createdAt),
      });

      await tx
        .update(bid)
        .set({
          createdAt,
          previousHash,
          hash,
        })
        .where(eq(bid.id, placedBid.id));
      await retimeBidMovements(tx, placedBid.id, placed[index - 1]?.id, createdAt);

      previousHash = hash;
    }

    await tx
      .update(lot)
      .set({ headHash: previousHash })
      .where(eq(lot.id, lotId));
  });
}

async function retimeBidMovements(
  tx: Pick<DatabaseExecutor, "update">,
  bidId: string,
  previousBidId: string | undefined,
  createdAt: Date,
) {
  await tx
    .update(walletMovement)
    .set({ createdAt })
    .where(
      and(eq(walletMovement.bidId, bidId), eq(walletMovement.type, "HOLD")),
    );

  if (previousBidId !== undefined) {
    await tx
      .update(walletMovement)
      .set({ createdAt })
      .where(
        and(
          eq(walletMovement.bidId, previousBidId),
          eq(walletMovement.type, "RELEASE"),
        ),
      );
  }
}

async function closeEndedLots(lots: SeededLot[]) {
  for (const seeded of lots) {
    if (seeded.plan.status !== "ended") {
      continue;
    }

    await db
      .update(lot)
      .set({
        startsAt: seeded.plan.startsAt,
        originalEndsAt: seeded.plan.endsAt,
        endsAt: seeded.plan.endsAt,
      })
      .where(eq(lot.id, seeded.id));
  }
}

async function settleEndedLots(
  lots: SeededLot[],
  now: Date,
  settle: typeof settleDueLots,
) {
  const ended = lots.filter((seeded) => seeded.plan.status === "ended");

  if (ended.length === 0) {
    return;
  }

  const titles = new Map(ended.map((seeded) => [seeded.id, seeded.title]));
  const results = await settle({
    now: () => now,
    listDueLotIds: async () => ended.map((seeded) => seeded.id),
  });

  if (results.length !== ended.length) {
    throw new Error("Ended lot settlement did not return every seeded lot");
  }

  for (const result of results) {
    if (result.outcome !== "settled") {
      throw new Error(`Lot ${result.lotId} was not settled`);
    }

    const title = titles.get(result.lotId) ?? result.lotId;

    console.log(
      result.winnerId === null
        ? `settled lot ${title} with no winner`
        : `settled lot ${title}`,
    );
  }
}

async function cancelSeededLots(auctioneerEmail: string, lots: SeededLot[]) {
  const canceled = lots.filter((seeded) => seeded.plan.status === "canceled");

  if (canceled.length === 0) {
    return;
  }

  const auctioneerId = await findUserId(auctioneerEmail);

  for (const seeded of canceled) {
    await cancelLot({
      lotId: seeded.id,
      auctioneerId,
      role: "AUCTIONEER",
    });
    console.log(`canceled lot ${seeded.title}`);
  }
}

async function findUserId(email: string) {
  const found = await findSeedUserByEmail(db, email);

  if (!found) {
    throw new Error(`User ${email} was not found`);
  }

  return found.id;
}

function seedDepositsQuery(userId: string) {
  return db
    .select({ id: walletMovement.id, amount: walletMovement.amount })
    .from(walletMovement)
    .innerJoin(wallet, eq(wallet.id, walletMovement.walletId))
    .where(and(eq(wallet.userId, userId), eq(walletMovement.type, "DEPOSIT")));
}
