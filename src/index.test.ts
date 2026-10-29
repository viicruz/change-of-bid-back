//* Libraries imports
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startApplication: vi.fn<() => Promise<void>>(),
}));

vi.mock("./bootstrap", () => ({ startApplication: mocks.startApplication }));
vi.mock("./app", () => { throw new Error("Real application was loaded"); });
vi.mock("./db", () => { throw new Error("Shared pool was loaded"); });
vi.mock("@elysiajs/cron", () => { throw new Error("Real scheduler was loaded"); });

describe("application entrypoint", () => {
  it("starts the application once and waits for startup before finishing the import", async () => {
    vi.resetModules();
    const startup = Promise.withResolvers<void>();
    mocks.startApplication.mockReturnValueOnce(startup.promise);
    const importCompleted = vi.fn();

    const entrypoint = import("./index").then(importCompleted);

    try {
      await vi.waitFor(() => {
        expect(mocks.startApplication).toHaveBeenCalledExactlyOnceWith();
      });
      expect(importCompleted).not.toHaveBeenCalled();
    } finally {
      startup.resolve();
      await entrypoint;
    }

    expect(importCompleted).toHaveBeenCalledOnce();
    expect(mocks.startApplication).toHaveBeenCalledExactlyOnceWith();
  });
});
