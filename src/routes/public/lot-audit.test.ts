//* Libraries imports
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

//* Schemas imports
import { addMoney } from "../../schemas/money";

//* Local imports
import { app } from "../../app";
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
import { placeBid, type AcceptedBid } from "../../services/lots/place-bid";

const now = new Date("2026-10-26T15:00:00.000Z");
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];

type Account = {
  id: string;
  email: string;
  name: string;
};

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);

function hoursFromNow(hours: number) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function minutesFromNow(minutes: number) {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function request(path: string) {
  return new Request(`${baseUrl}${path}`, {
    method: "GET",
  });
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
  const email = `audit-route-${role.toLowerCase()}-${id}@example.com`;

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

async function insertLiveLot(auctioneerId: string) {
  const endsAt = hoursFromNow(2);
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: "Audited lot",
      description: null,
      openingBid: "10.00",
      minIncrement: "0.50",
      startsAt: hoursFromNow(-1),
      originalEndsAt: endsAt,
      endsAt,
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

async function readStoredSecrets(lotId: string) {
  const anchors = await db
    .select({
      headHash: lot.headHash,
    })
    .from(lot)
    .where(eq(lot.id, lotId));
  const rows = await db
    .select({
      id: bid.id,
      previousHash: bid.previousHash,
      hash: bid.hash,
      bidderId: bid.bidderId,
      participantId: lotParticipant.id,
    })
    .from(bid)
    .innerJoin(lotParticipant, eq(bid.participantId, lotParticipant.id))
    .where(eq(bid.lotId, lotId))
    .orderBy(asc(bid.sequence));
  const anchor = anchors[0];

  if (!anchor) {
    throw new Error("Lot was not found");
  }

  return {
    headHash: anchor.headHash,
    rows,
  };
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

describe("GET /public/lots/:id/audit", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("when the lot chain is intact", () => {
    it("returns only the public audit keys without a session", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const firstBidder = await insertBidder("Hidden First Bidder");
      const secondBidder = await insertBidder("Hidden Second Bidder");
      const lotId = await insertLiveLot(auctioneer.id);
      const accepted = await placeAcceptedBids(
        lotId,
        [firstBidder, secondBidder],
        2,
      );
      const stored = await readStoredSecrets(lotId);
      const response = await app.handle(
        request(`/public/lots/${lotId}/audit`),
      );
      const raw = await response.text();
      const body = JSON.parse(raw) as {
        audit?: {
          lotId?: string;
          status?: string;
          bids?: Array<Record<string, unknown>>;
        };
      };
      const audit = body.audit;

      expect(response.status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(["audit"]);
      expect(Object.keys(audit ?? {}).sort()).toEqual([
        "bids",
        "lotId",
        "status",
      ]);
      expect(audit).toEqual({
        lotId,
        status: "INTACT",
        bids: accepted.map((entry) => ({
          sequence: entry.sequence,
          amount: entry.amount,
          createdAt: entry.createdAt.toISOString(),
          participantNo: entry.participantNo,
        })),
      });

      for (const entry of audit?.bids ?? []) {
        expect(Object.keys(entry).sort()).toEqual([
          "amount",
          "createdAt",
          "participantNo",
          "sequence",
        ]);
      }

      for (const account of [auctioneer, firstBidder, secondBidder]) {
        expect(raw).not.toContain(account.id);
        expect(raw).not.toContain(account.email);
        expect(raw).not.toContain(account.name);
      }

      for (const row of stored.rows) {
        expect(raw).not.toContain(row.id);
        expect(raw).not.toContain(row.bidderId);
        expect(raw).not.toContain(row.participantId);
        expect(raw).not.toContain(row.previousHash);
        expect(raw).not.toContain(row.hash);
      }

      expect(stored.headHash).toEqual(expect.any(String));
      expect(raw).not.toContain(stored.headHash as string);
      expect(raw).not.toContain(env.BID_HASH_SECRET);
    });
  });

  describe("when the lot does not exist", () => {
    it("returns LOT_NOT_FOUND for an unknown uuid", async () => {
      const response = await app.handle(
        request(`/public/lots/${crypto.randomUUID()}/audit`),
      );
      const body = (await response.json()) as {
        code?: string;
        message?: string;
      };

      expect(response.status).toBe(404);
      expect(body).toEqual({
        code: "LOT_NOT_FOUND",
        message: "Lot was not found.",
      });
    });
  });

  describe("when the id is not a uuid", () => {
    it("rejects the request with the existing validation response", async () => {
      const response = await app.handle(
        request("/public/lots/not-a-uuid/audit"),
      );
      const body = (await response.json()) as { type?: string };

      expect(response.status).toBe(422);
      expect(body.type).toBe("validation");
    });
  });

  describe("when the bid chain is tampered", () => {
    it("returns tampered instead of an error", async () => {
      const auctioneer = await insertUser("AUCTIONEER", "Hidden Auctioneer");
      const bidder = await insertBidder("Hidden First Bidder");
      const lotId = await insertLiveLot(auctioneer.id);
      const accepted = await placeAcceptedBids(lotId, [bidder], 1);
      const placed = accepted[0];

      if (placed === undefined) {
        throw new Error("Accepted bid was not stored");
      }

      await db.update(bid).set({ amount: "99.00" }).where(eq(bid.lotId, lotId));

      const response = await app.handle(
        request(`/public/lots/${lotId}/audit`),
      );
      const body = (await response.json()) as {
        code?: string;
        audit?: {
          lotId?: string;
          status?: string;
          bids?: Array<{
            sequence?: number;
            amount?: string;
            createdAt?: string;
            participantNo?: number;
          }>;
        };
      };

      expect(response.status).toBe(200);
      expect(body.code).toBeUndefined();
      expect(body.audit).toEqual({
        lotId,
        status: "TAMPERED",
        bids: [
          {
            sequence: placed.sequence,
            amount: "99.00",
            createdAt: placed.createdAt.toISOString(),
            participantNo: placed.participantNo,
          },
        ],
      });
    });
  });
});
