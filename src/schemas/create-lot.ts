//* Libraries imports
import { z } from "zod";

//* Schemas imports
import { moneySchema } from "./money";

const descriptionSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => {
    if (value === undefined || value === null || value.length === 0) {
      return null;
    }

    return value;
  });

export const createLotBodySchema = z.object({
  title: z.string().trim().min(1),
  description: descriptionSchema,
  openingBid: moneySchema,
  minIncrement: moneySchema,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  cardIds: z.array(z.number().int().positive()).min(1),
});
