//* Libraries imports
import { expect, it, vi } from "vitest";

// Importing the operation must not load the shared pool or demo seed services.
vi.mock("./index", () => { throw new Error("Shared pool was loaded"); });
vi.mock("./seed-lots", () => { throw new Error("Lot seed was loaded"); });
vi.mock("./seed-lot-activity", () => { throw new Error("Activity seed was loaded"); });

it("imports the user upsert without a database URL or seed side effects", async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  try {
    const { upsertSeedUser } = await import("./seed-users");
    expect(upsertSeedUser).toBeTypeOf("function");
  } finally {
    vi.unstubAllEnvs();
  }
});
