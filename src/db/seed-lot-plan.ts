//* Schemas imports
import { addMoney } from "../schemas/money";

const openingBidStart = 25;
const openingBidEnd = 100;
const dayMs = 24 * 60 * 60 * 1000;
const scheduledDurationDays = 3;
const seedDeckCount = 40;
const lotsPerStatus = 10;

export const seedMinIncrement = "5.00";

export const seedDepositAmounts = [
  "100.00",
  "250.00",
  "500.00",
  "1000.00",
  "2500.00",
] as const;

const depositDaysAgo = [40, 36, 32, 28, 24] as const;

const seedLotStatuses = [
  "scheduled",
  "live",
  "ended",
  "canceled",
] as const;

export type SeedLotStatus = (typeof seedLotStatuses)[number];

export type SeedBidder = "bidder" | "bidder2";

export type SeedLotPlan = {
  index: number;
  status: SeedLotStatus;
  openingBid: string;
  minIncrement: string;
  insertStartsAt: Date;
  insertEndsAt: Date;
  startsAt: Date;
  endsAt: Date;
  bids: readonly SeedBidder[];
};

const bidder = "bidder" satisfies SeedBidder;
const bidder2 = "bidder2" satisfies SeedBidder;

const liveBids: readonly (readonly SeedBidder[])[] = [
  [],
  [bidder],
  [bidder, bidder2],
  [bidder, bidder2, bidder],
  [],
  [bidder2],
  [bidder2, bidder],
  [bidder, bidder2, bidder],
  [],
  [bidder2, bidder, bidder2],
];

const endedBids: readonly (readonly SeedBidder[])[] = [
  [bidder, bidder2, bidder],
  [bidder2, bidder, bidder2],
  [bidder, bidder2],
  [],
  [bidder2, bidder],
  [bidder, bidder2, bidder],
  [bidder2, bidder, bidder2],
  [],
  [bidder, bidder2],
  [bidder2, bidder],
];

const canceledBids: readonly (readonly SeedBidder[])[] = [
  [bidder, bidder2],
  [],
  [bidder],
  [],
  [bidder2, bidder],
  [],
  [bidder, bidder2, bidder],
  [],
  [bidder2],
  [],
];

export function planSeedLots(now: Date): SeedLotPlan[] {
  return Array.from({ length: seedDeckCount }, (_, index) => {
    const status = statusForIndex(index);
    const offset = index % lotsPerStatus;
    const finalWindow = finalWindowFor(status, now, offset);
    const insertWindow =
      status === "ended" ? openWindow(now, offset) : finalWindow;

    return {
      index,
      status,
      openingBid: openingBidFor(index, seedDeckCount),
      minIncrement: seedMinIncrement,
      insertStartsAt: insertWindow.startsAt,
      insertEndsAt: insertWindow.endsAt,
      startsAt: finalWindow.startsAt,
      endsAt: finalWindow.endsAt,
      bids: bidsFor(status, offset),
    };
  });
}

export function bidAmountForStep(openingBid: string, step: number): string {
  let amount = openingBid;

  for (let index = 0; index < step; index += 1) {
    amount = addMoney(amount, seedMinIncrement);
  }

  return amount;
}

export function depositInstants(now: Date): Date[] {
  return depositDaysAgo.map(
    (daysAgo) => new Date(now.getTime() - daysAgo * dayMs),
  );
}

export function bidInstants(
  startsAt: Date,
  endsAt: Date,
  count: number,
  now: Date,
): Date[] {
  if (count === 0) {
    return [];
  }

  const windowEnd = Math.min(endsAt.getTime(), now.getTime());
  const span = windowEnd - startsAt.getTime();

  if (span <= count) {
    throw new Error("Lot window is too short for the planned bids");
  }

  return Array.from({ length: count }, (_, step) => {
    const at =
      startsAt.getTime() + Math.floor((span * (step + 1)) / (count + 1));

    return new Date(at);
  });
}

function statusForIndex(index: number): SeedLotStatus {
  const status = seedLotStatuses[Math.floor(index / lotsPerStatus)];

  if (status === undefined) {
    throw new Error(`Deck index ${index} is outside the seed plan`);
  }

  return status;
}

function bidsFor(status: SeedLotStatus, offset: number): readonly SeedBidder[] {
  const scripts =
    status === "live"
      ? liveBids
      : status === "ended"
        ? endedBids
        : status === "canceled"
          ? canceledBids
          : null;
  const script = scripts?.[offset];

  if (scripts === null) {
    return [];
  }

  if (script === undefined) {
    throw new Error(`Missing bid script for ${status} offset ${offset}`);
  }

  return script;
}

function finalWindowFor(status: SeedLotStatus, now: Date, offset: number) {
  if (status === "scheduled") {
    const startsAt = new Date(now.getTime() + (1 + offset) * dayMs);

    return {
      startsAt,
      endsAt: new Date(startsAt.getTime() + scheduledDurationDays * dayMs),
    };
  }

  if (status === "ended") {
    return {
      startsAt: new Date(now.getTime() - (12 + offset) * dayMs),
      endsAt: new Date(now.getTime() - (1 + offset) * dayMs),
    };
  }

  return openWindow(now, offset);
}

function openWindow(now: Date, offset: number) {
  return {
    startsAt: new Date(now.getTime() - dayMs),
    endsAt: new Date(now.getTime() + (2 + offset) * dayMs),
  };
}

function openingBidFor(index: number, count: number) {
  if (count <= 1) {
    return openingBidStart.toFixed(2);
  }

  const amount =
    openingBidStart +
    ((openingBidEnd - openingBidStart) * index) / (count - 1);

  return amount.toFixed(2);
}
