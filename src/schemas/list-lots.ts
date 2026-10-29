//* Libraries imports
import { z } from "zod";
import {
  listedLotItemSchema,
  lotStatusSchema,
  lotSummarySchema,
} from "./lot-read";

const publicLotStatusSchema = z.enum(["SCHEDULED", "LIVE", "ENDED"]);

export const publicLotListingItemLimit = 5;

const auctioneerLotStatusSchema = lotStatusSchema;

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

const publicLotSchema = lotSummarySchema.extend({
  status: publicLotStatusSchema,
  sold: z.boolean(),
  totalItems: z.number().int().nonnegative(),
  items: z.array(listedLotItemSchema).max(publicLotListingItemLimit),
});

const auctioneerLotSchema = lotSummarySchema.extend({
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
