//* Libraries imports
import { describe, expect, it } from "vitest";

//* Local imports
import { formatListedMoney } from "./money";

describe("formatListedMoney", () => {
  it("pads a whole number to two decimal places", () => {
    expect(formatListedMoney("10")).toBe("10.00");
  });

  it("pads a single decimal place", () => {
    expect(formatListedMoney("10.5")).toBe("10.50");
  });

  it("keeps an amount that already has two decimal places", () => {
    expect(formatListedMoney("10.50")).toBe("10.50");
  });

  it("drops extra trailing zeros", () => {
    expect(formatListedMoney("10.500")).toBe("10.50");
  });

  it("keeps a negative sign", () => {
    expect(formatListedMoney("-1.2")).toBe("-1.20");
  });

  it("returns null when a digit past the second decimal place is non-zero", () => {
    expect(formatListedMoney("10.501")).toBeNull();
  });

  it("returns null when the value is not a decimal amount", () => {
    expect(formatListedMoney("abc")).toBeNull();
  });
});
