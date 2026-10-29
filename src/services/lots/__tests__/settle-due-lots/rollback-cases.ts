//* Libraries imports
import { describe, expect, it } from "vitest";

//* Models imports
import { markLotEnded } from "../../../../models/lot";
import { insertReceipt } from "../../../../models/receipt";
import {
  decreaseTotalAndCommittedBalance,
  increaseTotalBalance,
} from "../../../../models/wallet";

//* Local imports
import { joinPublicLotRoom } from "../../public-lot-live";
import { settleDueLots, type SettleDueLotsDependencies } from "../../settle-due-lots";
import {
  clock,
  hour,
  leadLot,
  openLot,
  settle,
  settleFor,
  settlementError,
  shift,
} from "./fixtures";
import { readLot, readMovements, readReceipts, readWallet } from "./reads";

export function registerFinancialRollbackCases() {
  describe("when a financial write fails", () => {
    const injectedFailure = new Error("Injected settlement failure");
    const cases = [
      {
        stage: "winner debit",
        dependencies: {
          decreaseTotalAndCommittedBalance: async (...args) => {
            await decreaseTotalAndCommittedBalance(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "auctioneer credit",
        dependencies: {
          increaseTotalBalance: async (...args) => {
            await increaseTotalBalance(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "receipt insertion",
        dependencies: {
          insertReceipt: async (...args) => {
            await insertReceipt(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "lot closure",
        dependencies: {
          markLotEnded: async (...args) => {
            await markLotEnded(...args);
            throw injectedFailure;
          },
        },
      },
      {
        stage: "share token validation",
        dependencies: { createShareToken: () => "invalid-token" },
      },
    ] satisfies {
      stage: string;
      dependencies: Partial<SettleDueLotsDependencies>;
    }[];

    it.each(cases)(
      "rolls back $stage and publishes nothing, then permits a retry",
      async ({ stage, dependencies }) => {
        const opened = await openLot({ endsAt: shift(clock, hour) });
        const leader = await leadLot(opened.lotId, "25.00", clock);
        const messages: string[] = [];
        const leave = await joinPublicLotRoom(opened.lotId, (payload) =>
          messages.push(payload),
        );
        messages.length = 0;

        try {
          const result = await settle(
            settleDueLots({
              ...dependencies,
              now: () => shift(clock, 2 * hour),
            }),
          );
          expect(result.status).toBe("rejected");
          if (result.status !== "rejected") {
            throw new Error("Expected settlement failure");
          }
          expect(settlementError(result.error, opened.lotId)?.cause).toEqual(
            stage === "share token validation"
              ? new Error("Share token must be 32 bytes encoded as base64url")
              : injectedFailure,
          );
          expect(await readLot(opened.lotId)).toMatchObject({
            status: "ACTIVE",
            winnerId: null,
            endedAt: null,
            settledAt: null,
            currentBidId: leader.accepted.id,
          });
          expect(await readWallet(leader.bidderId)).toMatchObject({
            totalBalance: "100.00",
            committedBalance: "25.00",
            availableBalance: "75.00",
          });
          expect(await readWallet(opened.auctioneerId)).toMatchObject({
            totalBalance: "0.00",
            committedBalance: "0.00",
            availableBalance: "0.00",
          });
          expect(await readMovements(opened.lotId)).toEqual([
            {
              type: "HOLD",
              amount: "25.00",
              bidId: leader.accepted.id,
              walletId: leader.walletId,
            },
          ]);
          expect(await readReceipts(opened.lotId)).toEqual([]);
          expect(messages).toEqual([]);

          await settleFor(shift(clock, 2 * hour));
          await settleFor(shift(clock, 2 * hour));
          expect(await readLot(opened.lotId)).toMatchObject({
            status: "ENDED",
            winnerId: leader.bidderId,
          });
          expect(await readWallet(leader.bidderId)).toMatchObject({
            totalBalance: "75.00",
            committedBalance: "0.00",
          });
          expect(await readWallet(opened.auctioneerId)).toMatchObject({
            totalBalance: "25.00",
          });
          expect(
            (await readMovements(opened.lotId))
              .map((entry) => entry.type)
              .sort(),
          ).toEqual(["HOLD", "SETTLEMENT_CREDIT", "SETTLEMENT_DEBIT"]);
          expect(await readReceipts(opened.lotId)).toHaveLength(1);
          expect(messages).toHaveLength(1);
        } finally {
          leave();
        }
      },
    );
  });
}
