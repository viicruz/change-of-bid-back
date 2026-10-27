//* Libraries imports
import { z } from "zod";

export const publicLotStatusSchema = z.enum(["SCHEDULED", "LIVE", "ENDED"]);

export const auctioneerLotStatusSchema = z.enum([
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "CANCELED",
]);

const lotSearchQuerySchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (value === undefined || value.length === 0) {
      return undefined;
    }

    return value;
  });

export const listPublicLotsQuerySchema = z.object({
  q: lotSearchQuerySchema,
  status: publicLotStatusSchema.optional(),
});

export const listAuctioneerLotsQuerySchema = z.object({
  q: lotSearchQuerySchema,
  status: auctioneerLotStatusSchema.optional(),
});

const listedLotItemSchema = z.object({
  id: z.uuid(),
  position: z.number().int(),
  cardId: z.number().int(),
  quantity: z.number().int(),
  cardName: z.string(),
  imagePath: z.string(),
});

const publicLotSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  openingBid: z.string(),
  minIncrement: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  status: publicLotStatusSchema,
  currentBid: z.string().nullable(),
  bidCount: z.number().int(),
  sold: z.boolean(),
  items: z.array(listedLotItemSchema),
});

const auctioneerLotSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  openingBid: z.string(),
  minIncrement: z.string(),
  startsAt: z.date(),
  endsAt: z.date(),
  status: auctioneerLotStatusSchema,
  currentBid: z.string().nullable(),
  bidCount: z.number().int(),
  sold: z.boolean(),
  receivedAmount: z.string().nullable(),
  items: z.array(listedLotItemSchema),
});

export const listPublicLotsResponseSchema = z.object({
  lots: z.array(publicLotSchema),
});

export const listAuctioneerLotsResponseSchema = z.object({
  totalReceived: z.string(),
  lots: z.array(auctioneerLotSchema),
});

export type PublicLotStatus = z.infer<typeof publicLotStatusSchema>;
export type AuctioneerLotStatus = z.infer<typeof auctioneerLotStatusSchema>;
export type ListPublicLotsQuery = z.infer<typeof listPublicLotsQuerySchema>;
export type ListAuctioneerLotsQuery = z.infer<
  typeof listAuctioneerLotsQuerySchema
>;
