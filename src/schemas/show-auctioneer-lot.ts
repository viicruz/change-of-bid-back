//* Libraries imports
import { z } from "zod";

export const showAuctioneerLotStatusSchema = z.enum([
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELED",
]);

export const showAuctioneerLotParamsSchema = z.object({
  id: z.uuid(),
});

const shownAuctioneerLotItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  cardId: z.number().int(),
  quantity: z.number().int(),
  cardName: z.string(),
  imagePath: z.string(),
  cardSnapshot: z.record(z.string(), z.unknown()),
});

const shownAuctioneerLotBidSchema = z.object({
  sequence: z.number().int(),
  amount: z.string(),
  createdAt: z.date(),
  participantNo: z.number().int(),
});

const shownAuctioneerLotSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  openingBid: z.string(),
  minIncrement: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  extensionCount: z.number().int(),
  status: showAuctioneerLotStatusSchema,
  currentBid: z.string().nullable(),
  leaderParticipantNo: z.number().int().nullable(),
  bidCount: z.number().int(),
  sold: z.boolean(),
  winnerParticipantNo: z.number().int().nullable(),
  receivedAmount: z.string().nullable(),
  items: z.array(shownAuctioneerLotItemSchema),
  bids: z.array(shownAuctioneerLotBidSchema),
});

export const showAuctioneerLotResponseSchema = z.object({
  serverNow: z.date(),
  lot: shownAuctioneerLotSchema,
});

export const showAuctioneerLotForbiddenSchema = z.object({
  code: z.enum(["NOT_AUCTIONEER", "LOT_NOT_OWNED"]),
  message: z.string(),
});

export const showAuctioneerLotNotFoundSchema = z.object({
  code: z.literal("LOT_NOT_FOUND"),
  message: z.string(),
});

export type ShowAuctioneerLotStatus = z.infer<
  typeof showAuctioneerLotStatusSchema
>;
