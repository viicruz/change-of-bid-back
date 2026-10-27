//* Libraries imports
import { z } from "zod";

export const bidderParticipationStatusSchema = z.enum([
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELED",
]);

const listedParticipationItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  cardId: z.number().int(),
  quantity: z.number().int(),
  cardName: z.string(),
  imagePath: z.string(),
});

const bidderParticipationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  openingBid: z.string(),
  minIncrement: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  status: bidderParticipationStatusSchema,
  currentBid: z.string().nullable(),
  bidCount: z.number().int(),
  participantNo: z.number().int().positive(),
  won: z.boolean(),
  items: z.array(listedParticipationItemSchema),
});

export const listBidderParticipationsResponseSchema = z.object({
  lots: z.array(bidderParticipationSchema),
});

export type BidderParticipationStatus = z.infer<
  typeof bidderParticipationStatusSchema
>;
