//* Libraries imports
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

//* Services imports
import { canonicalBidTimestamp, chainBidHash, genesisBidHash } from "./bid-hash";
import * as bidHash from "./bid-hash";
import { loadShownLotBids } from "./lot-read";
import { showPublicLotAudit } from "./show-public-lot-audit";

const { anchorQuery, executor, transaction } = vi.hoisted(() => {
  const anchorQuery = vi.fn();
  const executor = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: anchorQuery })) })),
  };

  return {
    anchorQuery,
    executor,
    transaction: vi.fn(
      async (work: (connection: typeof executor) => Promise<unknown>) =>
        work(executor),
    ),
  };
});

vi.mock("../../db/index", () => ({ db: { transaction } }));
vi.mock("./lot-read", () => ({ loadShownLotBids: vi.fn() }));

const lotId = "30d94534-7a54-4886-9581-353244ab581c";
const hashSecret = "audit-integrity-test-secret-at-least-32-characters";
type StoredBid = Awaited<ReturnType<typeof loadShownLotBids>>[number];
type Chain = {
  rows: StoredBid[];
  bidCount: number;
  headHash: string | null;
};

function createChain(): Chain {
  let previousHash = genesisBidHash(hashSecret, lotId);
  const rows = ["10.00", "10.50", "11.00"].map((amount, index) => {
    const fields = {
      previousHash,
      lotId,
      sequence: index + 1,
      participantNo: index + 1,
      amount,
      createdAt: `2026-10-26T15:0${index}:00.000Z`,
    };
    const hash = chainBidHash(hashSecret, fields);
    previousHash = hash;

    return {
      ...fields,
      id: `private-bid-${index}`,
      userId: `private-user-${index}`,
      createdAt: new Date(fields.createdAt),
      hash,
    };
  });

  return { rows, bidCount: rows.length, headHash: previousHash };
}

// Re-sign the chain so link/format checks cannot pass just because HMACs match.
function resignChain(chain: Chain, startIndex = 0) {
  for (const row of chain.rows.slice(startIndex)) {
    row.hash = chainBidHash(hashSecret, {
      ...row,
      lotId,
      createdAt: canonicalBidTimestamp(row.createdAt),
    });
    const next = chain.rows[row.sequence];
    if (next !== undefined) {
      next.previousHash = row.hash;
    }
    chain.headHash = row.hash;
  }
}

async function auditChain(chain: Chain) {
  anchorQuery.mockResolvedValue([
    { id: lotId, bidCount: chain.bidCount, headHash: chain.headHash },
  ]);
  vi.mocked(loadShownLotBids).mockResolvedValue(chain.rows);

  return showPublicLotAudit(lotId, { hashSecret });
}

describe("showPublicLotAudit chain integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies every bid using one read-only repeatable-read transaction", async () => {
    const chain = createChain();

    expect(await auditChain(chain)).toEqual({
      audit: {
        lotId,
        status: "INTACT",
        bids: [
          {
            sequence: 1,
            amount: "10.00",
            createdAt: new Date("2026-10-26T15:00:00.000Z"),
            participantNo: 1,
          },
          {
            sequence: 2,
            amount: "10.50",
            createdAt: new Date("2026-10-26T15:01:00.000Z"),
            participantNo: 2,
          },
          {
            sequence: 3,
            amount: "11.00",
            createdAt: new Date("2026-10-26T15:02:00.000Z"),
            participantNo: 3,
          },
        ],
      },
    });
    expect(transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
    expect(loadShownLotBids).toHaveBeenCalledExactlyOnceWith(executor, lotId);
  });

  it.each([
    { bidCount: 0, headHash: null, status: "INTACT" },
    { bidCount: 1, headHash: null, status: "TAMPERED" },
    { bidCount: 0, headHash: "unexpected-head", status: "TAMPERED" },
    { bidCount: 1, headHash: "unexpected-head", status: "TAMPERED" },
  ])(
    "reports $status for an empty chain with count $bidCount and head $headHash",
    async ({ bidCount, headHash, status }) => {
      expect(await auditChain({ rows: [], bidCount, headHash })).toEqual({
        audit: { lotId, status, bids: [] },
      });
    },
  );

  const corruptions: Array<{ name: string; change: (chain: Chain) => void }> = [
    {
      name: "a count smaller than the stored rows",
      change: (chain) => {
        chain.bidCount = 2;
      },
    },
    {
      name: "a count larger than the stored rows",
      change: (chain) => {
        chain.bidCount = 4;
      },
    },
    {
      name: "a sequence that starts after one",
      change: (chain) => {
        chain.rows[0]!.sequence = 2;
      },
    },
    {
      name: "a missing middle sequence with an updated count",
      change: (chain) => {
        chain.rows.splice(1, 1);
        chain.bidCount = 2;
      },
    },
    {
      name: "a repeated sequence",
      change: (chain) => {
        chain.rows[1]!.sequence = 1;
      },
    },
    {
      name: "an altered genesis with otherwise valid hashes",
      change: (chain) => {
        chain.rows[0]!.previousHash = "wrong-genesis";
        resignChain(chain);
      },
    },
    {
      name: "a broken link with otherwise valid hashes",
      change: (chain) => {
        chain.rows[1]!.previousHash = "wrong-link";
        resignChain(chain, 1);
      },
    },
    {
      name: "a changed amount",
      change: (chain) => {
        chain.rows[1]!.amount = "99.00";
      },
    },
    {
      name: "a changed participant",
      change: (chain) => {
        chain.rows[1]!.participantNo = 99;
      },
    },
    {
      name: "a changed timestamp",
      change: (chain) => {
        chain.rows[1]!.createdAt = new Date("2026-10-26T15:01:00.001Z");
      },
    },
    {
      name: "an invalid date",
      change: (chain) => {
        chain.rows[1]!.createdAt = new Date(NaN);
      },
    },
    {
      name: "a date outside the canonical four-digit year",
      change: (chain) => {
        chain.rows[1]!.createdAt = new Date("+010000-01-01T00:00:00.000Z");
      },
    },
    {
      name: "a changed bid hash",
      change: (chain) => {
        chain.rows[1]!.hash = "wrong-hash";
      },
    },
    {
      name: "an altered head on an otherwise valid chain",
      change: (chain) => {
        chain.headHash = "wrong-head";
      },
    },
    {
      name: "a missing head on a nonempty chain",
      change: (chain) => {
        chain.headHash = null;
      },
    },
  ];

  it.each(corruptions)("reports tampered for $name", async ({ change }) => {
    const chain = createChain();
    change(chain);

    const result = await auditChain(chain);

    expect(result.audit.status).toBe("TAMPERED");
    expect(result.audit.bids).toHaveLength(chain.rows.length);
  });

  it.each(["not-money", "0.00", "-1.00", "1000000.01", "10.001"])(
    "rejects invalid money %s even with matching hashes and head",
    async (amount) => {
      const chain = createChain();
      chain.rows[1]!.amount = amount;
      resignChain(chain);

      const result = await auditChain(chain);

      expect(result.audit.status).toBe("TAMPERED");
      expect(result.audit.bids[1]?.amount).toBe(amount);
    },
  );

  it.each(["10", "10.0", " 10.00 "])(
    "preserves normalization for the valid stored amount %s",
    async (amount) => {
      const chain = createChain();
      chain.rows[0]!.amount = amount;

      const result = await auditChain(chain);

      expect(result.audit.status).toBe("INTACT");
      expect(result.audit.bids[0]?.amount).toBe("10.00");
    },
  );

  it.each(["genesisBidHash", "chainBidHash"] as const)(
    "fails closed when %s unexpectedly throws",
    async (method) => {
      const chain = createChain();
      vi.spyOn(bidHash, method).mockImplementationOnce(() => {
        throw new Error("Hash computation failed");
      });

      const result = await auditChain(chain);

      expect(result.audit.status).toBe("TAMPERED");
      expect(result.audit.bids).toHaveLength(3);
    },
  );
});
