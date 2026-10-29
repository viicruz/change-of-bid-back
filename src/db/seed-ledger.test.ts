//* Libraries imports
import { asc, inArray } from "drizzle-orm";
import { afterAll, assert, beforeAll, describe, expect, it, vi } from "vitest";

//* Local imports
import { db } from "./index";
import { loadDeckFixtures } from "./deck-fixtures";
import { account, bid, card, lot, lotItem, lotParticipant, receipt, user, wallet, walletMovement } from "./schema";
import { seedLotActivity } from "./seed-lot-activity";
import { seedLots, type SeededLot } from "./seed-lots";
import { depositInstants, seedDepositAmounts } from "./seed-lot-plan";
import { upsertSeedUser } from "./seed-users";

//* Services imports
import * as deposits from "../services/wallet/deposit";
import * as bids from "../services/lots/place-bid";
import { showPublicLotAudit } from "../services/lots/show-public-lot-audit";

const suffix = crypto.randomUUID();
const auctioneerEmail = `seed-ledger-owner-${suffix}@example.test`;
const bidderEmails = {
  bidder: `seed-ledger-first-${suffix}@example.test`,
  bidder2: `seed-ledger-second-${suffix}@example.test`,
};
const emails = [auctioneerEmail, ...Object.values(bidderEmails)];
const insertedCardIds: number[] = [];
const movementEffects = {
  DEPOSIT: [1n, 0n],
  SETTLEMENT_CREDIT: [1n, 0n],
  SETTLEMENT_DEBIT: [-1n, -1n],
  HOLD: [0n, 1n],
  RELEASE: [0n, -1n],
} as const;
let now: Date;
let seeded: SeededLot[] = [];
let users: (typeof user.$inferSelect)[] = [];
let depositOrder: number[];
let firstBidOrder: number;

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected seed download"); }));
  now = new Date();
  for (const email of emails) {
    await upsertSeedUser(db, {
      email, name: "Seed Ledger Test", role: email === auctioneerEmail ? "AUCTIONEER" : "BIDDER",
    }, "already-hashed-test-password");
  }
  users = await db.select().from(user).where(inArray(user.email, emails));

  // Use the real deck fixtures and a preloaded catalog to avoid external APIs.
  const decks = (await loadDeckFixtures()).slice(0, 32);
  const ids = [...new Set(decks.flatMap((deck) => deck.cards.map((entry) => entry.passcode)))];
  const inserted = await db.insert(card).values(ids.map((id) => ({
    id, name: `Seed card ${id}`, type: "Normal Monster", frameType: "normal", race: "Warrior",
    raw: { id, name: `Seed card ${id}` }, imagePath: `/seed-test/${id}.jpg`, fetchedAt: now,
  }))).onConflictDoNothing().returning({ id: card.id });
  insertedCardIds.push(...inserted.map((row) => row.id));

  seeded = await seedLots(auctioneerEmail, now);
  const deposit = vi.spyOn(deposits, "deposit");
  const placeBid = vi.spyOn(bids, "placeBid");
  await seedLotActivity({ auctioneerEmail, bidderEmails, lots: seeded, now });
  depositOrder = [...deposit.mock.invocationCallOrder];
  firstBidOrder = placeBid.mock.invocationCallOrder[0];
}, 30_000);

afterAll(async () => {
  try {
    const storedUsers = await db.select({ id: user.id }).from(user).where(inArray(user.email, emails));
    const userIds = storedUsers.map((entry) => entry.id);
    if (userIds.length > 0) {
      const ownedLots = await db.select({ id: lot.id }).from(lot).where(inArray(lot.auctioneerId, userIds));
      const lotIds = ownedLots.map((entry) => entry.id);
      const wallets = await db.select({ id: wallet.id }).from(wallet).where(inArray(wallet.userId, userIds));
      if (wallets.length > 0) {
        await db.delete(walletMovement).where(inArray(walletMovement.walletId, wallets.map((entry) => entry.id)));
      }
      if (lotIds.length > 0) {
        await db.delete(receipt).where(inArray(receipt.lotId, lotIds));
        await db.update(lot).set({ currentBidId: null }).where(inArray(lot.id, lotIds));
        await db.delete(bid).where(inArray(bid.lotId, lotIds));
        await db.delete(lotParticipant).where(inArray(lotParticipant.lotId, lotIds));
        await db.delete(lotItem).where(inArray(lotItem.lotId, lotIds));
        await db.delete(lot).where(inArray(lot.id, lotIds));
      }
      await db.delete(wallet).where(inArray(wallet.userId, userIds));
      await db.delete(account).where(inArray(account.userId, userIds));
      await db.delete(user).where(inArray(user.id, userIds));
    }
    if (insertedCardIds.length > 0) await db.delete(card).where(inArray(card.id, insertedCardIds));
  } finally {
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await db.$client.end();
  }
});

async function readState() {
  const ids = seeded.map((entry) => entry.id);
  const wallets = await db.select().from(wallet).where(inArray(wallet.userId, users.map((entry) => entry.id)))
    .orderBy(asc(wallet.id));
  return {
    wallets,
    lots: await db.select().from(lot).where(inArray(lot.id, ids)).orderBy(asc(lot.id)),
    bids: await db.select().from(bid).where(inArray(bid.lotId, ids)).orderBy(asc(bid.sequence), asc(bid.id)),
    movements: await db.select().from(walletMovement).where(inArray(walletMovement.walletId, wallets.map((entry) => entry.id)))
      .orderBy(asc(walletMovement.createdAt), asc(walletMovement.id)),
    receipts: await db.select().from(receipt).where(inArray(receipt.lotId, ids)).orderBy(asc(receipt.id)),
  };
}

function cents(amount: string) {
  assert(/^\d+\.\d{2}$/.test(amount));
  return BigInt(amount.replace(".", ""));
}

describe("seed financial ledger", () => {
  it("creates eight lots per status and completes all ten deposits before the first bid", async () => {
    const state = await readState();
    expect(state.lots).toHaveLength(32);
    expect(state.lots.filter((entry) => entry.status === "ACTIVE" && entry.startsAt > now)).toHaveLength(8);
    expect(state.lots.filter((entry) => entry.status === "ACTIVE" && entry.startsAt <= now)).toHaveLength(8);
    expect(state.lots.filter((entry) => entry.status === "ENDED")).toHaveLength(8);
    expect(state.lots.filter((entry) => entry.status === "CANCELED")).toHaveLength(8);
    expect(depositOrder).toHaveLength(10);
    expect(Math.max(...depositOrder)).toBeLessThan(firstBidOrder);

    for (const email of Object.values(bidderEmails)) {
      const bidder = users.find((entry) => entry.email === email);
      assert(bidder);
      const funds = state.wallets.find((entry) => entry.userId === bidder.id);
      assert(funds);
      const movements = state.movements.filter((entry) => entry.walletId === funds.id && entry.type === "DEPOSIT");
      expect(movements.map((entry) => entry.amount)).toEqual(seedDepositAmounts);
      expect(movements.map((entry) => entry.createdAt)).toEqual(depositInstants(now));
      const firstBidAt = Math.min(...state.bids.filter((entry) => entry.bidderId === bidder.id).map((entry) => entry.createdAt.getTime()));
      expect(Math.max(...movements.map((entry) => entry.createdAt.getTime()))).toBeLessThan(firstBidAt);
      expect(movements.every((entry) => entry.lotId === null && entry.bidId === null)).toBe(true);
    }
  });

  it("reconciles wallet balances and keeps historical reserves within the available funds", async () => {
    const state = await readState();
    for (const funds of state.wallets) {
      let total = 0n;
      let committed = 0n;
      // PostgreSQL can give simultaneous movements the same timestamp.
      const instants = new Map<number, typeof state.movements>();
      for (const movement of state.movements.filter((entry) => entry.walletId === funds.id)) {
        const at = movement.createdAt.getTime();
        instants.set(at, [...(instants.get(at) ?? []), movement]);
      }
      for (const movements of instants.values()) {
        for (const movement of movements) {
          const amount = cents(movement.amount);
          const [totalDelta, committedDelta] = movementEffects[movement.type];
          total += totalDelta * amount;
          committed += committedDelta * amount;
        }
        expect(total).toBeGreaterThanOrEqual(0n);
        expect(committed).toBeGreaterThanOrEqual(0n);
        expect(committed).toBeLessThanOrEqual(total);
      }
      expect(cents(funds.totalBalance)).toBe(total);
      expect(cents(funds.committedBalance)).toBe(committed);
    }
    expect(state.wallets.reduce((sum, entry) => sum + cents(entry.totalBalance), 0n)).toBe(870000n);

  });

  it("matches each bid to its HOLD and releases only outbid or canceled reserves", async () => {
    const state = await readState();
    for (const accepted of state.bids) {
      const owned = state.wallets.find((entry) => entry.userId === accepted.bidderId);
      assert(owned);
      const hold = state.movements.filter((entry) => entry.bidId === accepted.id && entry.type === "HOLD");
      expect(hold).toHaveLength(1);
      expect(hold[0]).toMatchObject({ walletId: owned.id, lotId: accepted.lotId, amount: accepted.amount, createdAt: accepted.createdAt });
      const next = state.bids.find((entry) => entry.lotId === accepted.lotId && entry.sequence === accepted.sequence + 1);
      const stored = state.lots.find((entry) => entry.id === accepted.lotId);
      assert(stored);
      const releases = state.movements.filter((entry) => entry.bidId === accepted.id && entry.type === "RELEASE");
      expect(releases).toHaveLength(next || stored.status === "CANCELED" ? 1 : 0);
      if (releases[0]) {
        expect(releases[0]).toMatchObject({ walletId: owned.id, lotId: accepted.lotId, amount: accepted.amount });
        if (next) expect(releases[0].createdAt).toEqual(next.createdAt);
        else expect(releases[0].createdAt.getTime()).toBeGreaterThan(accepted.createdAt.getTime());
      }
    }
  });

  it("balances settlement debits and credits, records the winners and preserves the bid chains", async () => {
    const state = await readState();
    expect(state.receipts).toHaveLength(6);
    for (const stored of state.lots) {
      expect((await showPublicLotAudit(stored.id)).audit.status).toBe("INTACT");
      const settlement = state.movements.filter((entry) => entry.lotId === stored.id && entry.type.startsWith("SETTLEMENT_"));
      if (stored.status !== "ENDED" || stored.winnerId === null) {
        expect(settlement).toEqual([]);
        continue;
      }
      const winning = state.bids.find((entry) => entry.id === stored.currentBidId);
      assert(winning);
      const winnerWallet = state.wallets.find((entry) => entry.userId === stored.winnerId);
      const ownerWallet = state.wallets.find((entry) => entry.userId === stored.auctioneerId);
      assert(winnerWallet && ownerWallet);
      expect(settlement).toHaveLength(2);
      expect(settlement).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "SETTLEMENT_DEBIT", walletId: winnerWallet.id, amount: winning.amount, bidId: null }),
        expect.objectContaining({ type: "SETTLEMENT_CREDIT", walletId: ownerWallet.id, amount: winning.amount, bidId: null }),
      ]));
      expect(state.receipts.find((entry) => entry.lotId === stored.id)).toMatchObject({
        winningBidId: winning.id, winnerId: stored.winnerId, finalAmount: winning.amount, endedAt: stored.endsAt,
      });
    }
  });

  it("does not duplicate lots, deposits, bids, movements or receipts on a second run", async () => {
    const before = await readState();
    const second = await seedLots(auctioneerEmail, now);
    expect(second).toEqual([]);
    await seedLotActivity({ auctioneerEmail, bidderEmails, lots: second, now });
    expect(await readState()).toEqual(before);
  });
});
