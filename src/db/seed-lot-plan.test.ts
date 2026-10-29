//* Libraries imports
import { describe, expect, it } from "vitest";

//* Schemas imports
import { addMoney, compareMoney } from "../schemas/money";

//* Local imports
import {
  bidAmountForStep,
  bidInstants,
  depositInstants,
  planSeedLots,
  seedDepositAmounts,
  seedMinIncrement,
  type SeedBidder,
  type SeedLotPlan,
  type SeedLotStatus,
} from "./seed-lot-plan";

const now = new Date("2026-10-27T15:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1000;
const antiSnipeMs = 2 * 60 * 1000;

describe("planSeedLots", () => {
  const plans = planSeedLots(now);

  it("assigns eight decks to each visible status in fixture order", () => {
    expect(plans).toHaveLength(32);
    expect(plans.map((plan) => plan.index)).toEqual(
      Array.from({ length: 32 }, (_, index) => index),
    );
    expect(plans.map((plan) => plan.status)).toEqual([
      ...Array<SeedLotStatus>(8).fill("scheduled"),
      ...Array<SeedLotStatus>(8).fill("live"),
      ...Array<SeedLotStatus>(8).fill("ended"),
      ...Array<SeedLotStatus>(8).fill("canceled"),
    ]);
  });

  it("ramps the opening bid from 25.00 to 100.00", () => {
    expect(plans[0]?.openingBid).toBe("25.00");
    expect(plans[31]?.openingBid).toBe("100.00");

    for (const plan of plans) {
      expect(plan.minIncrement).toBe(seedMinIncrement);
    }

    for (let index = 1; index < plans.length; index += 1) {
      const previous = plans[index - 1];
      const current = plans[index];

      expect(previous).toBeDefined();
      expect(current).toBeDefined();

      if (!previous || !current) {
        continue;
      }

      expect(compareMoney(current.openingBid, previous.openingBid)).toBe(1);
    }
  });

  it("schedules pending lots in the future for three days without bids", () => {
    const scheduled = plans.filter((plan) => plan.status === "scheduled");

    scheduled.forEach((plan, offset) => {
      const startsAt = now.getTime() + (1 + offset) * dayMs;

      expect(plan.startsAt.getTime()).toBe(startsAt);
      expect(plan.endsAt.getTime()).toBe(startsAt + 3 * dayMs);
      expect(plan.insertStartsAt).toEqual(plan.startsAt);
      expect(plan.insertEndsAt).toEqual(plan.endsAt);
      expect(plan.bids).toEqual([]);
      expect(plan.startsAt.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  it("keeps live lots open from yesterday through the coming days", () => {
    const live = plans.filter((plan) => plan.status === "live");

    live.forEach((plan, offset) => {
      expect(plan.startsAt.getTime()).toBe(now.getTime() - dayMs);
      expect(plan.endsAt.getTime()).toBe(now.getTime() + (2 + offset) * dayMs);
      expect(plan.insertStartsAt).toEqual(plan.startsAt);
      expect(plan.insertEndsAt).toEqual(plan.endsAt);
      expect(plan.startsAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(plan.endsAt.getTime()).toBeGreaterThan(now.getTime());
    });

    expect(live.some((plan) => plan.bids.length === 0)).toBe(true);
    expect(live.some((plan) => plan.bids.length > 0)).toBe(true);
    expect(live.every((plan) => plan.bids.length <= 3)).toBe(true);
  });

  it("opens ended lots for bidding and then closes them in the past", () => {
    const ended = plans.filter((plan) => plan.status === "ended");

    ended.forEach((plan, offset) => {
      expect(plan.insertStartsAt.getTime()).toBe(now.getTime() - dayMs);
      expect(plan.insertEndsAt.getTime()).toBe(
        now.getTime() + (2 + offset) * dayMs,
      );
      expect(plan.startsAt.getTime()).toBe(now.getTime() - (12 + offset) * dayMs);
      expect(plan.endsAt.getTime()).toBe(now.getTime() - (1 + offset) * dayMs);
      expect(plan.startsAt.getTime()).toBeLessThan(plan.endsAt.getTime());
      expect(plan.endsAt.getTime()).toBeLessThanOrEqual(now.getTime());
    });

    const unsold = ended.filter((plan) => plan.bids.length === 0);

    expect(unsold.length).toBeGreaterThanOrEqual(1);
    expect(unsold.length).toBeLessThanOrEqual(2);
  });

  it("keeps canceled lots open until the seed cancels them", () => {
    const canceled = plans.filter((plan) => plan.status === "canceled");

    canceled.forEach((plan, offset) => {
      expect(plan.startsAt.getTime()).toBe(now.getTime() - dayMs);
      expect(plan.endsAt.getTime()).toBe(now.getTime() + (2 + offset) * dayMs);
      expect(plan.insertStartsAt).toEqual(plan.startsAt);
      expect(plan.insertEndsAt).toEqual(plan.endsAt);
    });

    const withBids = canceled.filter((plan) => plan.bids.length > 0);

    expect(withBids.length).toBeGreaterThanOrEqual(4);
    expect(withBids.length).toBeLessThanOrEqual(6);
  });

  it("accepts bids only while the inserted window is open and away from the end", () => {
    for (const plan of plans) {
      if (plan.bids.length === 0) {
        continue;
      }

      expect(plan.insertStartsAt.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(plan.insertEndsAt.getTime() - now.getTime()).toBeGreaterThan(
        antiSnipeMs,
      );
    }
  });

  it("gives each bidder at least one win and one loss", () => {
    const ended = plans.filter((plan) => plan.status === "ended");
    const wins = new Set<SeedBidder>();
    const losses = new Set<SeedBidder>();

    for (const plan of ended) {
      const winner = plan.bids.at(-1);

      if (winner === undefined) {
        continue;
      }

      wins.add(winner);

      for (const bidder of new Set(plan.bids)) {
        if (bidder !== winner) {
          losses.add(bidder);
        }
      }
    }

    expect(wins).toEqual(new Set<SeedBidder>(["bidder", "bidder2"]));
    expect(losses).toEqual(new Set<SeedBidder>(["bidder", "bidder2"]));
  });

  it("alternates bidders so the leader never outbids themselves", () => {
    for (const plan of plans) {
      for (let index = 1; index < plan.bids.length; index += 1) {
        expect(plan.bids[index]).not.toBe(plan.bids[index - 1]);
      }
    }
  });

  it("keeps each bidder's leading bids inside the seeded deposit total", () => {
    const deposited = seedDepositAmounts.reduce<string>(
      (total, amount) => addMoney(total, amount),
      "0.00",
    );

    expect(compareMoney(leadingCommit(plans, "bidder"), deposited)).toBeLessThan(
      1,
    );
    expect(
      compareMoney(leadingCommit(plans, "bidder2"), deposited),
    ).toBeLessThan(1);
  });
});

describe("bidAmountForStep", () => {
  it("starts at the opening bid and adds the minimum increment", () => {
    expect(bidAmountForStep("25.00", 0)).toBe("25.00");
    expect(bidAmountForStep("25.00", 1)).toBe("30.00");
    expect(bidAmountForStep("25.00", 2)).toBe("35.00");
  });
});

describe("bidInstants", () => {
  it("places bids strictly inside the final window and not after now", () => {
    const ended = planSeedLots(now).find((plan) => plan.status === "ended");

    expect(ended).toBeDefined();

    if (!ended) {
      return;
    }

    const instants = bidInstants(
      ended.startsAt,
      ended.endsAt,
      ended.bids.length,
      now,
    );

    expect(instants).toHaveLength(ended.bids.length);

    for (const instant of instants) {
      expect(instant.getTime()).toBeGreaterThan(ended.startsAt.getTime());
      expect(instant.getTime()).toBeLessThan(ended.endsAt.getTime());
      expect(instant.getTime()).toBeLessThan(now.getTime());
    }
  });

  it("returns no instants when the lot has no bids", () => {
    expect(bidInstants(now, new Date(now.getTime() + dayMs), 0, now)).toEqual(
      [],
    );
  });
});

describe("depositInstants", () => {
  it("spreads deposits across earlier days before the first ended lot", () => {
    const instants = depositInstants(now);
    const earliestStart = Math.min(
      ...planSeedLots(now)
        .filter((plan) => plan.status === "ended")
        .map((plan) => plan.startsAt.getTime()),
    );

    expect(instants).toHaveLength(seedDepositAmounts.length);

    for (let index = 1; index < instants.length; index += 1) {
      const previous = instants[index - 1];
      const current = instants[index];

      expect(previous).toBeDefined();
      expect(current).toBeDefined();

      if (!previous || !current) {
        continue;
      }

      expect(current.getTime()).toBeGreaterThan(previous.getTime());
    }

    for (const instant of instants) {
      expect(instant.getTime()).toBeLessThan(earliestStart);
    }
  });
});

function leadingCommit(plans: SeedLotPlan[], bidder: SeedBidder) {
  const amounts = plans.flatMap((plan) => {
    const leader = plan.bids.at(-1);

    if (leader !== bidder) {
      return [];
    }

    return [bidAmountForStep(plan.openingBid, plan.bids.length - 1)];
  });
  const first = amounts[0];

  if (first === undefined) {
    return "0.00";
  }

  return amounts.slice(1).reduce((total, amount) => addMoney(total, amount), first);
}
