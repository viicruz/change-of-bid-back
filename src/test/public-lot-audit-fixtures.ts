//* Libraries imports
import { eq, inArray } from "drizzle-orm";
import { expect } from "vitest";

//* Schemas imports
import { addMoney } from "../schemas/money";

//* Local imports
import { db } from "../db/index";
import {
  bid,
  lot,
  lotParticipant,
  user,
  wallet,
  walletMovement,
} from "../db/schema";

//* Services imports
import { placeBid, type AcceptedBid } from "../services/lots/place-bid";

export type AuditAccount = {
  id: string;
  email: string;
  name: string;
};

type PrivateBidRow = {
  id: string;
  bidderId: string;
  participantId: string;
  previousHash: string;
  hash: string;
};

export function createPublicLotAuditFixtures(emailPrefix: string) {
  const now = new Date("2026-10-26T15:00:00.000Z");
  const createdUserIds: string[] = [];
  const createdLotIds: string[] = [];

  function hoursFromNow(hours: number) {
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  function minutesFromNow(minutes: number) {
    return new Date(now.getTime() + minutes * 60 * 1000);
  }

  function placeFor(userId: string, lotId: string, amount: string, at: Date) {
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

  async function insertUser(
    role: "AUCTIONEER" | "BIDDER",
    name: string,
  ): Promise<AuditAccount> {
    const id = crypto.randomUUID();
    const email = `${emailPrefix}-${role.toLowerCase()}-${id}@example.com`;

    await db.insert(user).values({
      id,
      name,
      email,
      role,
    });
    createdUserIds.push(id);

    return { id, email, name };
  }

  async function insertBidder(name: string) {
    const account = await insertUser("BIDDER", name);

    await db.insert(wallet).values({
      userId: account.id,
      totalBalance: "100.00",
      committedBalance: "0.00",
    });

    return account;
  }

  async function insertLot(
    auctioneerId: string,
    values: {
      startsAt: Date;
      endsAt: Date;
    },
  ) {
    const rows = await db
      .insert(lot)
      .values({
        auctioneerId,
        title: "Audited lot",
        description: null,
        openingBid: "10.00",
        minIncrement: "0.50",
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

  async function placeAcceptedBids(
    lotId: string,
    bidders: AuditAccount[],
    count: number,
  ) {
    const accepted: AcceptedBid[] = [];
    let amount = "10.00";

    for (let index = 0; index < count; index += 1) {
      const bidder = bidders[index % bidders.length];

      if (bidder === undefined) {
        throw new Error("Bidder was not found");
      }

      accepted.push(
        await placeFor(bidder.id, lotId, amount, minutesFromNow(index)),
      );
      amount = addMoney(amount, "0.50");
    }

    return accepted;
  }

  async function cleanup() {
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

  return {
    now,
    hoursFromNow,
    minutesFromNow,
    insertUser,
    insertBidder,
    insertLot,
    placeAcceptedBids,
    cleanup,
  };
}

export function expectTextOmitsPrivateAuditData(
  text: string,
  input: {
    accounts: AuditAccount[];
    rows: PrivateBidRow[];
    headHash: string | null;
    hashSecret: string;
  },
) {
  for (const account of input.accounts) {
    expect(text).not.toContain(account.id);
    expect(text).not.toContain(account.email);
    expect(text).not.toContain(account.name);
  }

  for (const row of input.rows) {
    expect(text).not.toContain(row.id);
    expect(text).not.toContain(row.bidderId);
    expect(text).not.toContain(row.participantId);
    expect(text).not.toContain(row.previousHash);
    expect(text).not.toContain(row.hash);
  }

  expect(input.headHash).toEqual(expect.any(String));
  expect(text).not.toContain(input.headHash as string);
  expect(text).not.toContain(input.hashSecret);
}
