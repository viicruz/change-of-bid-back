//* Services imports
import type { ShownPublicLot, ShownPublicLotBid } from "./show-public-lot";

export type PublicLotLiveBid = Omit<ShownPublicLotBid, "createdAt"> & {
  createdAt: string;
};

export type PublicLotLiveLot = Omit<
  ShownPublicLot["lot"],
  "startsAt" | "endsAt" | "bids"
> & {
  startsAt: string;
  endsAt: string;
  bids: PublicLotLiveBid[];
};

export type PublicLotLiveMessage = {
  serverNow: string;
  lot: PublicLotLiveLot;
};

export function toPublicLotLiveMessage(
  shown: ShownPublicLot,
): PublicLotLiveMessage {
  return {
    serverNow: shown.serverNow.toISOString(),
    lot: {
      ...shown.lot,
      startsAt: shown.lot.startsAt.toISOString(),
      endsAt: shown.lot.endsAt.toISOString(),
      bids: shown.lot.bids.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
    },
  };
}
