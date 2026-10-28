//* Node imports
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

//* Libraries imports
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

//* Local imports
import { cardImageStorage } from "./lib/card-image-storage";
import { env } from "./env";

vi.mock("./lib/card-image-storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./lib/card-image-storage")>();
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "card-images-static-"));

  return {
    cardImageStorage: {
      ...original.cardImageStorage,
      assets: join(root, "cards"),
    },
  };
});

type ListeningServer = {
  stop(): unknown;
  raw?: {
    ready?(): Promise<unknown>;
    node?: { server?: { address(): { port: number } | string | null } };
  };
};

let server: ListeningServer;
let baseUrl: string;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  const { app } = await import("./app");
  server = await new Promise<ListeningServer>((resolve) => {
    app.listen({ hostname: "127.0.0.1", port: 0 }, (info) => {
      resolve(info as ListeningServer);
    });
  });
  await server.raw?.ready?.();
  const address = server.raw?.node?.server?.address();

  if (!address || typeof address === "string" || !address.port) {
    throw new Error("Card image test server did not bind a port");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
  await mkdir(cardImageStorage.assets, { recursive: true });
});

afterAll(async () => {
  await server?.stop();
  vi.unstubAllEnvs();
  await rm(join(cardImageStorage.assets, ".."), { recursive: true, force: true });
});

describe("card image static plugin", () => {
  it("serves files created after route registration in production with CORS", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
    await writeFile(join(cardImageStorage.assets, "6983839.jpg"), bytes);

    const origin = env.PAGE_ORIGIN;
    const response = await fetch(`${baseUrl}/card-images/6983839.jpg`, {
      headers: { origin },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/jpeg");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("does not serve index HTML or collide with public API routes", async () => {
    await writeFile(join(cardImageStorage.assets, "index.html"), "Unexpected index");

    const directory = await fetch(`${baseUrl}/card-images`);
    const publicApi = await fetch(`${baseUrl}/public`);

    expect(directory.status).toBe(404);
    expect(publicApi.status).toBe(200);
    expect(await publicApi.text()).toBe("Hello World");
  });
});
