//* Libraries imports
import { z } from "zod";

export const publicLotStatusSchema = z.enum(["SCHEDULED", "LIVE", "ENDED"]);

export const listPublicLotsQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      if (value === undefined || value.length === 0) {
        return undefined;
      }

      return value;
    }),
  status: publicLotStatusSchema.optional(),
});

const publicLotItemSchema = z.object({
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
  items: z.array(publicLotItemSchema),
});

export const listPublicLotsResponseSchema = z.object({
  lots: z.array(publicLotSchema),
});

export type PublicLotStatus = z.infer<typeof publicLotStatusSchema>;
export type ListPublicLotsQuery = z.infer<typeof listPublicLotsQuerySchema>;
