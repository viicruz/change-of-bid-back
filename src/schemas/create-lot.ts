//* Libraries imports
import { z } from "zod";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

const moneyError =
  "Money values must be greater than zero and have at most 2 decimal places.";

export function normalizeMoney(value: string): string | null {
  const trimmed = value.trim();

  if (!MONEY_PATTERN.test(trimmed)) {
    return null;
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const normalized = `${whole}.${fraction.padEnd(2, "0")}`;

  if (normalized === "0.00") {
    return null;
  }

  return normalized;
}

export const moneySchema = z.string().transform((value, context) => {
  const normalized = normalizeMoney(value);

  if (normalized === null) {
    context.addIssue({
      code: "custom",
      message: moneyError,
    });

    return z.NEVER;
  }

  return normalized;
});

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

export type CreateLotBody = z.infer<typeof createLotBodySchema>;
