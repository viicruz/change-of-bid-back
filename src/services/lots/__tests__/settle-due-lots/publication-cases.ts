//* Libraries imports
import { expect, it } from "vitest";

//* Local imports
import { db } from "../../../../db/index";
import { joinPublicLotRoom } from "../../public-lot-live";
import { settleDueLots } from "../../settle-due-lots";
import { clock, hour, leadLot, openLot, shift } from "./fixtures";
import { readLot, readReceipts, readWallet } from "./reads";

export function registerPostCommitPublicationCases() {
  it("publishes the winning settlement only after the transaction commits", async () => {
    const opened = await openLot({ endsAt: shift(clock, hour) });
    const leader = await leadLot(opened.lotId, "25.00", clock);
    let committed = false;
    const deliveries: { committed: boolean; payload: string }[] = [];
    const leave = await joinPublicLotRoom(opened.lotId, (payload) => {
      deliveries.push({ committed, payload });
    });
    deliveries.length = 0;

    try {
      await settleDueLots({
        now: () => shift(clock, 2 * hour),
        runInTransaction: async (work) => {
          const result = await db.transaction(async (tx) => {
            const settlement = await work(tx);
            expect(deliveries).toEqual([]);
            // A separate connection still sees the pre-commit state.
            expect(await readLot(opened.lotId)).toMatchObject({
              status: "ACTIVE",
            });
            expect(await readWallet(leader.bidderId)).toMatchObject({
              totalBalance: "100.00",
              committedBalance: "25.00",
            });
            expect(await readReceipts(opened.lotId)).toEqual([]);
            return settlement;
          });
          expect(deliveries).toEqual([]);
          expect(await readLot(opened.lotId)).toMatchObject({
            status: "ENDED",
          });
          expect(await readWallet(leader.bidderId)).toMatchObject({
            totalBalance: "75.00",
            committedBalance: "0.00",
          });
          expect(await readWallet(opened.auctioneerId)).toMatchObject({
            totalBalance: "25.00",
          });
          expect(await readReceipts(opened.lotId)).toHaveLength(1);
          committed = true;
          return result;
        },
      });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.committed).toBe(true);
      expect(JSON.parse(deliveries[0]!.payload).lot).toMatchObject({
        status: "ENDED",
        winnerParticipantNo: 1,
      });
    } finally {
      leave();
    }
  });
}
