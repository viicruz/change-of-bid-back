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

const CANONICAL_MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})\.\d{2}$/;

export class MoneyRangeError extends Error {
  constructor() {
    super("Money value is outside the supported range");
    this.name = "MoneyRangeError";
  }
}

function toCents(value: string): bigint {
  if (!CANONICAL_MONEY_PATTERN.test(value)) {
    throw new Error("Money value is not canonical");
  }

  const [whole, fraction] = value.split(".");

  return BigInt(whole) * 100n + BigInt(fraction);
}

export function compareMoney(left: string, right: string): -1 | 0 | 1 {
  const leftCents = toCents(left);
  const rightCents = toCents(right);

  if (leftCents < rightCents) {
    return -1;
  }

  if (leftCents > rightCents) {
    return 1;
  }

  return 0;
}

export function addMoney(left: string, right: string): string {
  const sum = toCents(left) + toCents(right);
  const whole = sum / 100n;
  const fraction = (sum % 100n).toString().padStart(2, "0");
  const result = `${whole.toString()}.${fraction}`;

  if (!CANONICAL_MONEY_PATTERN.test(result)) {
    throw new MoneyRangeError();
  }

  return result;
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
