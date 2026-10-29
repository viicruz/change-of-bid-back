//* Libraries imports
import type { SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

//* Local imports
import { bid, lot, user, walletMovement } from "./schema";
import { db } from "./index";
import { seedLotActivity } from "./seed-lot-activity";
import type { SeedLotStatus } from "./seed-lot-plan";
import type { SeededLot } from "./seed-lots";

//* Services imports
import type { placeBid } from "../services/lots/place-bid";
import type { LotSettlement, settleDueLots } from "../services/lots/settle-due-lots";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  txUpdate: vi.fn(),
  transaction: vi.fn(),
  placeBid: vi.fn<typeof placeBid>(),
  settleDueLots: vi.fn<typeof settleDueLots>(),
  cancelLot: vi.fn(),
  deposit: vi.fn(),
}));

// These tests never run the seed runner, connect to PostgreSQL or call services.
vi.mock("./index", () => ({
  db: { select: mocks.select, update: mocks.update, transaction: mocks.transaction },
}));
vi.mock("../env", () => ({
  env: { BID_HASH_SECRET: "seed-activity-test-secret-at-least-32-chars" },
}));
vi.mock("../services/lots/place-bid", () => ({ placeBid: mocks.placeBid }));
vi.mock("../services/lots/settle-due-lots", () => ({ settleDueLots: mocks.settleDueLots }));
vi.mock("../services/lots/cancel-lot", () => ({ cancelLot: mocks.cancelLot }));
vi.mock("../services/wallet/deposit", () => ({ deposit: mocks.deposit }));

const now = new Date("2026-10-28T15:00:00.000Z");
const dialect = new PgDialect();
const bidderEmails = { bidder: "first@example.test", bidder2: "second@example.test" };
const transactionExecutor = { update: mocks.txUpdate };
type Write = {
  table: PgTable;
  values: Record<string, unknown>;
  condition: { sql: string; params: unknown[] };
};
let writes: Write[];
let transactionWrites: Write[];
let settle: ReturnType<typeof vi.fn<typeof settleDueLots>>;

function seededLot(status: SeedLotStatus, id = "seeded-lot"): SeededLot {
  const day = status === "ended" ? "2026-10-01" : "2026-10-28";
  return {
    id,
    title: `Title ${id}`,
    plan: {
      index: 0,
      status,
      openingBid: "25.00",
      minIncrement: "5.00",
      insertStartsAt: new Date("2026-10-28T11:00:00.000Z"),
      insertEndsAt: new Date("2026-10-29T15:00:00.000Z"),
      startsAt: new Date(`${day}T11:00:00.000Z`),
      endsAt: new Date(status === "ended" ? "2026-10-01T15:00:00.000Z" : "2026-10-29T15:00:00.000Z"),
      bids: [],
    },
  };
}

function settled(lotId: string, winnerId: string | null = "first"): LotSettlement {
  return { lotId, outcome: "settled", winnerId, endedAt: now, settledAt: now };
}

function runActivity(lots: SeededLot[]) {
  return seedLotActivity({ auctioneerEmail: "owner@example.test", bidderEmails, lots, now }, {
    settleDueLots: settle,
  });
}

function recordUpdate(target: Write[], table: PgTable) {
  return {
    set: (values: Record<string, unknown>) => ({
      where: async (condition: SQL) => {
        target.push({ table, values, condition: dialect.sqlToQuery(condition) });
      },
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  writes = [];
  transactionWrites = [];
  settle = vi.fn<typeof settleDueLots>().mockResolvedValue([]);
  mocks.select.mockReturnValue({
    from: (table: PgTable) => {
      if (table === user) {
        return {
          where: (condition: SQL) => ({
            limit: async () => [{ id: dialect.sqlToQuery(condition).params[0] }],
          }),
        };
      }
      // Deposits already exist, so each test exercises only its selected lots.
      return { innerJoin: () => ({ where: () => ({ limit: async () => [{ id: "deposit" }] }) }) };
    },
  });
  mocks.update.mockImplementation((table: PgTable) => recordUpdate(writes, table));
  mocks.txUpdate.mockImplementation((table: PgTable) => recordUpdate(transactionWrites, table));
  mocks.transaction.mockImplementation(async (work: (tx: typeof transactionExecutor) => Promise<void>) => {
    await work(transactionExecutor);
  });
  mocks.placeBid.mockImplementation(async (input) => {
    const index = mocks.placeBid.mock.calls.length - 1;
    return {
      id: `bid-${index + 1}`,
      sequence: index + 1,
      participantNo: [7, 8, 7][index],
      amount: String(input.amount),
      createdAt: now,
      endsAt: new Date("2026-10-29T15:00:00.000Z"),
      extensionCount: 0,
    };
  });
  mocks.settleDueLots.mockResolvedValue([]);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  expect(mocks.deposit).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("seed activity settlement", () => {
  it("does not call settlement or open a transaction for an empty lot list", async () => {
    await runActivity([]);

    expect(settle).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.placeBid).not.toHaveBeenCalled();
    expect(mocks.cancelLot).not.toHaveBeenCalled();
  });

  it("does not settle scheduled, live or canceled lots", async () => {
    await runActivity([
      seededLot("scheduled", "scheduled"),
      seededLot("live", "live"),
      seededLot("canceled", "canceled"),
    ]);

    expect(settle).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.cancelLot).toHaveBeenCalledExactlyOnceWith({
      lotId: "canceled", auctioneerId: "owner@example.test", role: "AUCTIONEER",
    });
  });

  it("closes only ended lots before settling them with the seed clock and ids", async () => {
    const ended = seededLot("ended");
    const noWinner = seededLot("ended", "no-winner");
    settle.mockImplementation(async (dependencies) => {
      expect(writes).toHaveLength(2);
      expect(dependencies?.now?.()).toBe(now);
      expect(await dependencies?.listDueLotIds?.(db, now)).toEqual(["seeded-lot", "no-winner"]);
      return [settled("no-winner", null), settled("seeded-lot")];
    });

    await runActivity([seededLot("scheduled", "scheduled"), ended, seededLot("live", "live"), noWinner]);

    expect(settle).toHaveBeenCalledOnce();
    expect(mocks.settleDueLots).not.toHaveBeenCalled();
    expect(writes).toEqual([ended, noWinner].map((entry) => ({
      table: lot,
      values: { startsAt: entry.plan.startsAt, originalEndsAt: entry.plan.endsAt, endsAt: entry.plan.endsAt },
      condition: { sql: '"lot"."id" = $1', params: [entry.id] },
    })));
    expect(console.log).toHaveBeenCalledWith("settled lot Title no-winner with no winner");
    expect(console.log).toHaveBeenCalledWith("settled lot Title seeded-lot");
  });

  it("uses the imported settlement service by default without changing the caller", async () => {
    mocks.settleDueLots.mockResolvedValue([settled("seeded-lot")]);

    await seedLotActivity({ auctioneerEmail: "owner@example.test", bidderEmails, lots: [seededLot("ended")], now });

    expect(mocks.settleDueLots).toHaveBeenCalledOnce();
    expect(settle).not.toHaveBeenCalled();
  });

  it.each([
    { label: "empty", results: [] },
    { label: "missing a lot", results: [settled("seeded-lot")] },
    { label: "extra lot", results: [settled("seeded-lot"), settled("second"), settled("extra")] },
  ])("rejects a result count that is $label", async ({ results }) => {
    settle.mockResolvedValue(results);

    await expect(runActivity([seededLot("ended"), seededLot("ended", "second")]))
      .rejects.toThrow("Ended lot settlement did not return every seeded lot");

    expect(console.log).not.toHaveBeenCalledWith(expect.stringMatching(/^settled lot/));
  });

  it("rejects skipped results and stops before cancellation", async () => {
    settle.mockResolvedValue([{ lotId: "seeded-lot", outcome: "skipped" }]);

    await expect(runActivity([seededLot("ended"), seededLot("canceled")]))
      .rejects.toThrow("Lot seeded-lot was not settled");

    expect(mocks.cancelLot).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith(expect.stringMatching(/^settled lot/));
  });

  it("propagates a service failure without continuing to cancellation", async () => {
    const failure = new AggregateError([new Error("Failed transaction")], "Lot settlement failed");
    settle.mockRejectedValue(failure);

    await expect(runActivity([seededLot("ended"), seededLot("canceled")])).rejects.toBe(failure);

    expect(mocks.cancelLot).not.toHaveBeenCalled();
  });
});

// Fixed HMAC-SHA256 vectors, computed independently of the production helpers.
const genesis = "114c9c5f042279655a26e13d9f92c006519eab0904990648c371b0b2a042b249";
const openHashes = [
  "a424f757a1313ba6ce302322a3cc253dfa4cab3ba20ef0596578fae27d99c189",
  "5d8b600df29beadb5af98a29ec6429a2c1beec02596693e1411f704dba974ced",
  "12268ccb8581f375975325c948f47639a470c29ec1c1d9742b62d64089a083a2",
];
const endedHashes = [
  "aacaf2a50b04a4683ad85cf801dd19c787dc05afe5b528e26567aba4b542ed6b",
  "4ce0b78c5924f881671fe422d0b4a74743eac3696da36b687a518262fb06d011",
  "58259872a76b3b55361749254ffdebd6145176f70b72655518b0653f0f4b4ea1",
];

describe("seed activity bid retiming", () => {
  it.each([
    { status: "live", day: "2026-10-28", hashes: openHashes },
    { status: "canceled", day: "2026-10-28", hashes: openHashes },
    { status: "ended", day: "2026-10-01", hashes: endedHashes },
  ] as const)("retimes $status bids, HOLDs, RELEASEs and the chain head in one transaction", async ({ status, day, hashes }) => {
    const seeded = seededLot(status);
    seeded.plan.bids = ["bidder", "bidder2", "bidder"];
    settle.mockResolvedValue([settled(seeded.id)]);

    await runActivity([seeded]);

    expect(mocks.placeBid.mock.calls).toEqual([
      [{ lotId: seeded.id, userId: bidderEmails.bidder, role: "BIDDER", amount: "25.00" }],
      [{ lotId: seeded.id, userId: bidderEmails.bidder2, role: "BIDDER", amount: "30.00" }],
      [{ lotId: seeded.id, userId: bidderEmails.bidder, role: "BIDDER", amount: "35.00" }],
    ]);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(transactionWrites.filter((entry) => entry.table === bid)).toEqual(hashes.map((hash, index) => ({
      table: bid,
      values: {
        createdAt: new Date(`${day}T${12 + index}:00:00.000Z`),
        previousHash: index === 0 ? genesis : hashes[index - 1],
        hash,
      },
      condition: { sql: '"bid"."id" = $1', params: [`bid-${index + 1}`] },
    })));
    const movements = transactionWrites.filter((entry) => entry.table === walletMovement);
    expect(movements).toEqual([
      { time: 12, id: "bid-1", type: "HOLD" },
      { time: 13, id: "bid-2", type: "HOLD" },
      { time: 13, id: "bid-1", type: "RELEASE" },
      { time: 14, id: "bid-3", type: "HOLD" },
      { time: 14, id: "bid-2", type: "RELEASE" },
    ].map(({ time, id, type }) => ({
      table: walletMovement,
      values: { createdAt: new Date(`${day}T${time}:00:00.000Z`) },
      condition: { sql: '(("wallet_movement"."bid_id" = $1) and ("wallet_movement"."type" = $2))', params: [id, type] },
    })));
    expect(transactionWrites).toHaveLength(9);
    expect(transactionWrites.at(-1)).toEqual({
      table: lot,
      values: { headHash: hashes[2] },
      condition: { sql: '"lot"."id" = $1', params: [seeded.id] },
    });
    // Only the ended lot's schedule may be written outside the transaction.
    expect(writes).toHaveLength(status === "ended" ? 1 : 0);
  });

  it("does not create a RELEASE for a lot's only bid", async () => {
    const seeded = seededLot("live");
    seeded.plan.bids = ["bidder"];

    await runActivity([seeded]);

    expect(transactionWrites).toHaveLength(3);
    expect(transactionWrites.filter((entry) => entry.table === walletMovement)).toEqual([{
      table: walletMovement,
      values: { createdAt: new Date("2026-10-28T13:00:00.000Z") },
      condition: { sql: '(("wallet_movement"."bid_id" = $1) and ("wallet_movement"."type" = $2))', params: ["bid-1", "HOLD"] },
    }]);
    expect(writes).toEqual([]);
  });

  it("does not retime or replace the head of a lot without bids", async () => {
    await runActivity([seededLot("live")]);

    expect(mocks.placeBid).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("propagates a transaction write failure without updating the head or closing the lot", async () => {
    const failure = new Error("Failed HOLD update");
    mocks.txUpdate.mockImplementation((table: PgTable) => {
      if (table === walletMovement) {
        return { set: () => ({ where: async () => { throw failure; } }) };
      }
      return recordUpdate(transactionWrites, table);
    });
    const seeded = seededLot("ended");
    seeded.plan.bids = ["bidder", "bidder2"];

    await expect(runActivity([seeded])).rejects.toBe(failure);

    expect(transactionWrites.map((entry) => entry.table)).toEqual([bid]);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect(mocks.cancelLot).not.toHaveBeenCalled();
  });

  it("stops before retiming when a bid unexpectedly extends the lot", async () => {
    mocks.placeBid.mockResolvedValue({
      id: "bid-1", sequence: 1, participantNo: 7, amount: "25.00", createdAt: now,
      endsAt: now, extensionCount: 1,
    });
    const seeded = seededLot("ended");
    seeded.plan.bids = ["bidder", "bidder2"];

    await expect(runActivity([seeded])).rejects.toThrow("Bid on Title seeded-lot extended the lot");

    expect(mocks.placeBid).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  });
});
