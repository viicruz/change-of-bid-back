//* Libraries imports
import type { CronConfig } from "@elysiajs/cron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

//* Local imports
import { startApplication } from "./bootstrap";

type SettlementJob = Pick<CronConfig, "name" | "pattern"> & {
  run: () => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  cron: vi.fn<(config: SettlementJob) => unknown>(),
  plugin: () => {},
  use: vi.fn(),
  listen: vi.fn(),
  settleDueLots: vi.fn<() => Promise<unknown>>(),
  describeSettlementFailure: vi.fn<(error: unknown) => string>(),
}));

// Keep the real schedule constant, replacing the scheduler before it creates jobs.
vi.mock("@elysiajs/cron", async (importOriginal) => ({
  ...await importOriginal<typeof import("@elysiajs/cron")>(),
  cron: mocks.cron,
}));
vi.mock("./app", () => ({ app: { use: mocks.use, listen: mocks.listen } }));
vi.mock("./services/lots/settle-due-lots", () => ({
  settleDueLots: mocks.settleDueLots,
  describeSettlementFailure: mocks.describeSettlementFailure,
}));
vi.mock("./db", () => { throw new Error("Shared pool was loaded"); });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("PORT", undefined);
  mocks.cron.mockReturnValue(mocks.plugin);
  mocks.settleDueLots.mockResolvedValue([]);
  mocks.describeSettlementFailure.mockReturnValue("Settlement failed; the job will retry.");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function settlementJob() {
  const [config] = mocks.cron.mock.calls[0];
  return config;
}

describe("application bootstrap", () => {
  it("does not register jobs, settle lots or listen when imported", async () => {
    vi.resetModules();
    await import("./bootstrap");

    expect(mocks.cron).not.toHaveBeenCalled();
    expect(mocks.use).not.toHaveBeenCalled();
    expect(mocks.settleDueLots).not.toHaveBeenCalled();
    expect(mocks.listen).not.toHaveBeenCalled();
  });

  it("registers the ten-second job before settlement and waits before listening", async () => {
    const initialSettlement = Promise.withResolvers<void>();
    mocks.settleDueLots.mockReturnValueOnce(initialSettlement.promise);

    const startup = startApplication();

    expect(mocks.cron).toHaveBeenCalledExactlyOnceWith({
      name: "settleDueLots",
      pattern: "*/10 * * * * *",
      run: expect.any(Function),
    });
    expect(mocks.use).toHaveBeenCalledExactlyOnceWith(mocks.plugin);
    expect(mocks.cron).toHaveBeenCalledBefore(mocks.use);
    expect(mocks.use).toHaveBeenCalledBefore(mocks.settleDueLots);
    expect(mocks.settleDueLots).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.listen).not.toHaveBeenCalled();

    initialSettlement.resolve();
    await startup;

    expect(mocks.listen).toHaveBeenCalledExactlyOnceWith(
      { hostname: "0.0.0.0", port: 3001 },
      expect.any(Function),
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["4321", "0"])("uses the configured PORT %s as a number", async (port) => {
    vi.stubEnv("PORT", port);

    await startApplication();

    expect(mocks.listen).toHaveBeenCalledExactlyOnceWith(
      { hostname: "0.0.0.0", port: Number(port) },
      expect.any(Function),
    );
  });

  it("logs the address reported by the listener", async () => {
    await startApplication();

    expect(console.log).not.toHaveBeenCalled();
    const [, onListening] = mocks.listen.mock.calls[0];
    onListening({ hostname: "127.0.0.1", port: 54321 });

    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      "🦊 Elysia is running at http://127.0.0.1:54321",
    );
  });

  it("waits for settlement on each cron invocation", async () => {
    await startApplication();
    const scheduledSettlement = Promise.withResolvers<void>();
    mocks.settleDueLots.mockReturnValueOnce(scheduledSettlement.promise);

    const completed = vi.fn();
    const run = settlementJob().run;
    const pendingRun = run().then(completed);
    await Promise.resolve();

    expect(mocks.settleDueLots).toHaveBeenCalledTimes(2);
    expect(completed).not.toHaveBeenCalled();
    scheduledSettlement.resolve();
    await pendingRun;
    expect(completed).toHaveBeenCalledOnce();

    await run();
    expect(mocks.settleDueLots).toHaveBeenCalledTimes(3);
    expect(mocks.listen).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs an initial rejection and still starts listening", async () => {
    const error = new Error("Initial settlement failed");
    mocks.settleDueLots.mockRejectedValueOnce(error);

    await expect(startApplication()).resolves.toBeUndefined();

    expect(mocks.describeSettlementFailure).toHaveBeenCalledExactlyOnceWith(error);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Settlement failed; the job will retry.", error,
    );
    expect(console.error).toHaveBeenCalledBefore(mocks.listen);
    expect(mocks.listen).toHaveBeenCalledOnce();

    await settlementJob().run();
    expect(mocks.settleDueLots).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("contains synchronous settlement errors during startup", async () => {
    const error = new Error("Synchronous failure");
    mocks.settleDueLots.mockImplementationOnce(() => { throw error; });

    await expect(startApplication()).resolves.toBeUndefined();

    expect(mocks.describeSettlementFailure).toHaveBeenCalledExactlyOnceWith(error);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Settlement failed; the job will retry.", error,
    );
    expect(mocks.listen).toHaveBeenCalledOnce();
  });

  it("contains cron rejections and allows the next invocation to retry", async () => {
    await startApplication();
    const error = new AggregateError([new Error("Lot failed")], "Settlement failed");
    mocks.settleDueLots.mockRejectedValueOnce(error);
    const run = settlementJob().run;

    await expect(run()).resolves.toBeUndefined();

    expect(mocks.describeSettlementFailure).toHaveBeenCalledExactlyOnceWith(error);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Settlement failed; the job will retry.", error,
    );

    await expect(run()).resolves.toBeUndefined();
    expect(mocks.settleDueLots).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledOnce();
    expect(mocks.listen).toHaveBeenCalledOnce();
  });
});
