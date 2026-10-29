import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { client, createClient, migrate } = vi.hoisted(() => {
  const client = {
    connect: vi.fn(async () => {}),
    query: vi.fn(async (_sql: string) => {}),
    end: vi.fn(async () => {}),
  };

  return {
    client,
    createClient: vi.fn(function () {
      return client;
    }),
    migrate: vi.fn(() => ({ status: 0 })),
  };
});

vi.mock("pg", () => ({ Client: createClient }));
vi.mock("node:child_process", () => ({ spawnSync: migrate }));
vi.mock("dotenv/config", () => ({}));

const previousExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  client.query.mockResolvedValue(undefined);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DATABASE_URL", "postgresql://user:password@localhost:5432/fresh_test");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = previousExitCode;
});

async function expectRefusal(message: string) {
  await import("./fresh");

  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(console.error).toHaveBeenCalledWith(new Error(message));
  expect(createClient).not.toHaveBeenCalled();
  expect(migrate).not.toHaveBeenCalled();
}

describe("db:fresh", () => {
  it.each([
    "postgresql://user:password@localhost:5432/fresh_test",
    undefined,
  ])("refuses production before database access (DATABASE_URL=%s)", async (url) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", url);

    await expectRefusal("db:fresh cannot run when NODE_ENV is production");
  });

  it("requires a database URL", async () => {
    vi.stubEnv("DATABASE_URL", undefined);

    await expectRefusal("DATABASE_URL is not set");
  });

  it.each(["postgres", "template0", "template1"])(
    "keeps the reserved database %s protected",
    async (name) => {
      vi.stubEnv("DATABASE_URL", `postgresql://localhost/${name}`);

      await expectRefusal(`Database "${name}" cannot be reset`);
    },
  );

  it("rejects invalid database names", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/invalid-name");

    await expectRefusal(
      'Database name "invalid-name" must match ^[A-Za-z_][A-Za-z0-9_]*$',
    );
  });

  it("resets the selected development database before running migrations", async () => {
    await import("./fresh");

    await vi.waitFor(() => expect(migrate).toHaveBeenCalledOnce());
    expect(createClient).toHaveBeenCalledExactlyOnceWith({
      connectionString: "postgresql://user:password@localhost:5432/postgres",
    });
    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.query.mock.calls).toEqual([
      ['DROP DATABASE IF EXISTS "fresh_test" WITH (FORCE)'],
      ['CREATE DATABASE "fresh_test"'],
    ]);
    expect(client.end).toHaveBeenCalledOnce();
    expect(client.end.mock.invocationCallOrder[0]).toBeLessThan(
      migrate.mock.invocationCallOrder[0]!,
    );
    expect(migrate).toHaveBeenCalledWith(
      path.resolve("node_modules/.bin/drizzle-kit"),
      ["migrate"],
      { stdio: "inherit" },
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("closes the connection and skips migrations if reset fails", async () => {
    const failure = new Error("Reset failed");
    client.query.mockRejectedValueOnce(failure);

    await import("./fresh");

    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(console.error).toHaveBeenCalledWith(failure);
    expect(client.end).toHaveBeenCalledOnce();
    expect(migrate).not.toHaveBeenCalled();
  });
});
