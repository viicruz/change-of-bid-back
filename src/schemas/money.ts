//* Libraries imports
import { z } from "zod";

const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;

export const moneyValidationMessage =
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
      message: moneyValidationMessage,
    });

    return z.NEVER;
  }

  return normalized;
});
