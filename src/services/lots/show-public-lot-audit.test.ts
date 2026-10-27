//* Libraries imports
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Schemas imports
import { addMoney } from "../../schemas/money";

//* Local imports
import { db } from "../../db/index";
import {
  bid,
  lot,
  lotParticipant,
  user,
  wallet,
  walletMovement,
} from "../../db/schema";
import { env } from "../../env";
import {
  canonicalBidTimestamp,
  chainBidHash,
} from "./bid-hash";
import { cancelLot } from "./cancel-lot";
import { placeBid, type AcceptedBid } from "./place-bid";
import {
  showPublicLotAudit,
  ShowPublicLotAuditError,
} from "./show-public-lot-audit";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];

type Account = {
  id: string;
  email: string;
  name: string;
};

type StoredBid = {
  id: string;
  sequence: number;
  amount: string;
  createdAt: Date;
  previousHash: string;
  hash: string;
  bidderId: string;
  participantId: string;
  participantNo: number;
};

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function minutesFromNow(minutes: number) {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function publicBid(entry: {
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
}) {
  return {
    sequence: entry.sequence,
    amount: entry.amount,
    createdAt: entry.createdAt,
    participantNo: entry.participantNo,
  };
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
): Promise<Account> {
  const id = crypto.randomUUID();
  const email = `audit-${role.toLowerCase()}-${id}@example.com`;

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
  bidders: Account[],
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

async function readAnchor(lotId: string) {
  const rows = await db
    .select({
      bidCount: lot.bidCount,
      headHash: lot.headHash,
      status: lot.status,
    })
    .from(lot)
    .where(eq(lot.id, lotId));
  const row = rows[0];

  if (!row) {
    throw new Error("Lot was not found");
  }

  return row;
}

async function readBids(lotId: string): Promise<StoredBid[]> {
  return db
    .select({
      id: bid.id,
      sequence: bid.sequence,
      amount: bid.amount,
      createdAt: bid.createdAt,
      previousHash: bid.previousHash,
      hash: bid.hash,
      bidderId: bid.bidderId,
      participantId: lotParticipant.id,
      participantNo: lotParticipant.participantNo,
    })
    .from(bid)
    .innerJoin(lotParticipant, eq(bid.participantId, lotParticipant.id))
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));
}

async function deleteStoredBid(bidId: string) {
  await db
    .update(lot)
    .set({ currentBidId: null })
    .where(eq(lot.currentBidId, bidId));
  await db.delete(walletMovement).where(eq(walletMovement.bidId, bidId));
  await db.delete(bid).where(eq(bid.id, bidId));
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

describe("showPublicLotAudit", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the accepted chain is untouched", () => {
    it("reports intact for a chain of more than one bid", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const firstBidder = await insertBidder("Hidden First Bidder");
      const secondBidder = await insertBidder("Hidden Second Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(
        lotId,
        [firstBidder, secondBidder],
        2,
      );

      const audited = await showPublicLotAudit(lotId);

      expect(accepted.length).toBeGreaterThan(1);
      expect(audited).toEqual({
        audit: {
          lotId,
          status: "INTACT",
          bids: accepted.map(publicBid),
        },
      });
    });
  });

  describe("when the lot has no bids", () => {
    it("reports intact when the bid count is zero and the head hash is null", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(1),
        endsAt: hoursFromNow(3),
      });

      expect(await readAnchor(lotId)).toMatchObject({
        bidCount: 0,
        headHash: null,
      });

      const audited = await showPublicLotAudit(lotId);

      expect(audited).toEqual({
        audit: {
          lotId,
          status: "INTACT",
          bids: [],
        },
      });
    });
  });

  describe("when an accepted bid amount changes", () => {
    it("reports tampered without recomputing the hash", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const bidder = await insertBidder("Hidden First Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(lotId, [bidder], 1);
      const placed = accepted[0];
      const before = await readBids(lotId);
      const stored = before[0];

      if (placed === undefined || stored === undefined) {
        throw new Error("Accepted bid was not stored");
      }

      await db
        .update(bid)
        .set({ amount: "99.00" })
        .where(eq(bid.id, stored.id));
      const after = await readBids(lotId);

      expect(after[0]?.hash).toBe(stored.hash);
      expect(after[0]?.amount).toBe("99.00");

      const audited = await showPublicLotAudit(lotId);

      expect(audited).toEqual({
        audit: {
          lotId,
          status: "TAMPERED",
          bids: [
            {
              ...publicBid(placed),
              amount: "99.00",
            },
          ],
        },
      });
    });
  });

  describe("when a middle bid is deleted", () => {
    it("reports tampered", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const firstBidder = await insertBidder("Hidden First Bidder");
      const secondBidder = await insertBidder("Hidden Second Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(
        lotId,
        [firstBidder, secondBidder],
        3,
      );
      const before = await readAnchor(lotId);
      const stored = await readBids(lotId);
      const middle = stored.find((entry) => entry.sequence === 2);

      if (middle === undefined) {
        throw new Error("Middle bid was not stored");
      }

      await deleteStoredBid(middle.id);

      expect(await readAnchor(lotId)).toMatchObject({
        bidCount: before.bidCount,
        headHash: before.headHash,
      });

      const audited = await showPublicLotAudit(lotId);

      expect(audited.audit.status).toBe("TAMPERED");
      expect(audited.audit.bids.map((entry) => entry.sequence)).toEqual([
        1, 3,
      ]);
      expect(audited.audit.bids).toEqual([
        publicBid(accepted[0] as AcceptedBid),
        publicBid(accepted[2] as AcceptedBid),
      ]);
    });
  });

  describe("when the last bid is deleted", () => {
    it("reports tampered when the bid count and head hash stay unchanged", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const firstBidder = await insertBidder("Hidden First Bidder");
      const secondBidder = await insertBidder("Hidden Second Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(
        lotId,
        [firstBidder, secondBidder],
        2,
      );
      const before = await readAnchor(lotId);
      const stored = await readBids(lotId);
      const last = stored[stored.length - 1];

      if (last === undefined) {
        throw new Error("Last bid was not stored");
      }

      await deleteStoredBid(last.id);
      const after = await readAnchor(lotId);

      expect(after.bidCount).toBe(before.bidCount);
      expect(after.headHash).toBe(before.headHash);
      expect(after.bidCount).toBe(2);
      expect(await readBids(lotId)).toHaveLength(1);

      const audited = await showPublicLotAudit(lotId);

      expect(audited).toEqual({
        audit: {
          lotId,
          status: "TAMPERED",
          bids: [publicBid(accepted[0] as AcceptedBid)],
        },
      });
    });
  });

  describe("when an inserted bid hash was not produced with the server secret", () => {
    it("reports tampered", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const bidder = await insertBidder("Hidden First Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(lotId, [bidder], 1);
      const stored = await readBids(lotId);
      const first = stored[0];
      const placed = accepted[0];

      if (first === undefined || placed === undefined) {
        throw new Error("Accepted bid was not stored");
      }

      const createdAt = new Date(
        canonicalBidTimestamp(minutesFromNow(5)),
      );
      const amount = "10.50";
      const sequence = 2;
      const forgedFields = {
        previousHash: first.hash,
        lotId,
        sequence,
        participantNo: first.participantNo,
        amount,
        createdAt: canonicalBidTimestamp(createdAt),
      };
      const forgedSecret = "different-bid-hash-secret-value!!";
      const forgedHash = chainBidHash(forgedSecret, forgedFields);
      const inserted = await db
        .insert(bid)
        .values({
          lotId,
          participantId: first.participantId,
          bidderId: first.bidderId,
          sequence,
          amount,
          createdAt,
          previousHash: first.hash,
          hash: forgedHash,
        })
        .returning({ id: bid.id });
      const forged = inserted[0];

      if (forged === undefined) {
        throw new Error("Insert bid did not return a row");
      }

      await db
        .update(lot)
        .set({
          bidCount: sequence,
          headHash: forgedHash,
          currentBidId: forged.id,
        })
        .where(eq(lot.id, lotId));
      const anchor = await readAnchor(lotId);
      const rows = await readBids(lotId);

      expect(rows.map((entry) => entry.sequence)).toEqual([1, 2]);
      expect(anchor.bidCount).toBe(2);
      expect(anchor.headHash).toBe(forgedHash);
      expect(rows[1]?.previousHash).toBe(first.hash);
      expect(forgedHash).not.toBe(
        chainBidHash(env.BID_HASH_SECRET, forgedFields),
      );

      const audited = await showPublicLotAudit(lotId);

      expect(audited).toEqual({
        audit: {
          lotId,
          status: "TAMPERED",
          bids: [
            publicBid(placed),
            {
              sequence,
              amount,
              createdAt,
              participantNo: first.participantNo,
            },
          ],
        },
      });
    });
  });

  describe("when the lot is canceled", () => {
    it("returns the earlier accepted bids and reports intact", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const firstBidder = await insertBidder("Hidden First Bidder");
      const secondBidder = await insertBidder("Hidden Second Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(
        lotId,
        [firstBidder, secondBidder],
        2,
      );

      await cancelLot(
        {
          lotId,
          auctioneerId: auctioneer.id,
          role: "AUCTIONEER",
        },
        { now: () => now },
      );

      expect(await readAnchor(lotId)).toMatchObject({
        status: "CANCELED",
      });

      const audited = await showPublicLotAudit(lotId);

      expect(audited).toEqual({
        audit: {
          lotId,
          status: "INTACT",
          bids: accepted.map(publicBid),
        },
      });
    });
  });

  describe("when the hash secret is missing or short", () => {
    it("reports verification failed and still returns the public bids", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const bidder = await insertBidder("Hidden First Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(lotId, [bidder], 1);
      const placed = accepted[0];
      const unusableSecrets = [undefined, "", "x".repeat(31)];

      if (placed === undefined) {
        throw new Error("Accepted bid was not stored");
      }

      for (const hashSecret of unusableSecrets) {
        const audited = await showPublicLotAudit(lotId, { hashSecret });

        expect(audited).toEqual({
          audit: {
            lotId,
            status: "VERIFICATION_FAILED",
            bids: [publicBid(placed)],
          },
        });
      }

      await db
        .update(bid)
        .set({ amount: "99.00" })
        .where(eq(bid.lotId, lotId));

      const failed = await showPublicLotAudit(lotId, {
        hashSecret: "x".repeat(31),
      });

      expect(failed).toEqual({
        audit: {
          lotId,
          status: "VERIFICATION_FAILED",
          bids: [
            {
              ...publicBid(placed),
              amount: "99.00",
            },
          ],
        },
      });
    });
  });

  describe("when the lot does not exist", () => {
    it("throws lot not found", async () => {
      await expect(
        showPublicLotAudit(crypto.randomUUID()),
      ).rejects.toMatchObject({
        name: "ShowPublicLotAuditError",
        code: "LOT_NOT_FOUND",
        message: "Lot was not found.",
      });
      await expect(
        showPublicLotAudit(crypto.randomUUID()),
      ).rejects.toBeInstanceOf(ShowPublicLotAuditError);
    });
  });

  describe("when the audit is returned", () => {
    it("omits personal data and hash material", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const firstBidder = await insertBidder("Hidden First Bidder");
      const secondBidder = await insertBidder("Hidden Second Bidder");
      const lotId = await insertLot(auctioneer.id, {
        startsAt: hoursFromNow(-1),
        endsAt: hoursFromNow(2),
      });
      const accepted = await placeAcceptedBids(
        lotId,
        [firstBidder, secondBidder],
        2,
      );
      const stored = await readBids(lotId);
      const anchor = await readAnchor(lotId);

      const audited = await showPublicLotAudit(lotId);
      const serialized = JSON.stringify(audited);

      expect(audited).toEqual({
        audit: {
          lotId,
          status: "INTACT",
          bids: accepted.map(publicBid),
        },
      });
      expect(Object.keys(audited).sort()).toEqual(["audit"]);
      expect(Object.keys(audited.audit).sort()).toEqual([
        "bids",
        "lotId",
        "status",
      ]);

      for (const entry of audited.audit.bids) {
        expect(Object.keys(entry).sort()).toEqual([
          "amount",
          "createdAt",
          "participantNo",
          "sequence",
        ]);
      }

      for (const account of [auctioneer, firstBidder, secondBidder]) {
        expect(serialized).not.toContain(account.id);
        expect(serialized).not.toContain(account.email);
        expect(serialized).not.toContain(account.name);
      }

      for (const row of stored) {
        expect(serialized).not.toContain(row.id);
        expect(serialized).not.toContain(row.bidderId);
        expect(serialized).not.toContain(row.participantId);
        expect(serialized).not.toContain(row.previousHash);
        expect(serialized).not.toContain(row.hash);
      }

      expect(anchor.headHash).toEqual(expect.any(String));
      expect(serialized).not.toContain(anchor.headHash as string);
      expect(serialized).not.toContain(env.BID_HASH_SECRET);
    });
  });
});
