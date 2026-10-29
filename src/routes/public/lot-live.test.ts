//* Libraries imports
import { request as httpRequest } from "node:http";
import { connect as connectTcp } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

//* Local imports
import { app } from "../../app";
import { db } from "../../db/index";
import {
  bid,
  lot,
  lotParticipant,
  receipt,
  user,
  wallet,
  walletMovement,
} from "../../db/schema";
import { env } from "../../env";
import { readLiveFrames, type LiveFrame } from "./__tests__/lot-live-frames";

//* Services imports
import { publishPublicLot } from "../../services/lots/public-lot-live";
import type { PublicLotLiveMessage } from "../../services/lots/public-lot-live-message";
import { settleDueLots } from "../../services/lots/settle-due-lots";

const password = "Correct-horse-battery-1";
const bidderName = "Hidden Live Bidder";
const auctioneerName = "Hidden Live Auctioneer";
const createdUserIds: string[] = [];
const createdLotIds: string[] = [];
const clients: LiveClient[] = [];
const wires: LiveWire[] = [];

const websocketTextOpcode = 0x1;
const websocketCloseOpcode = 0x8;
const websocketPingOpcode = 0x9;
const websocketPongOpcode = 0xa;

type LiveServer = {
  hostname: string;
  port: number;
  stop: () => unknown;
};

type ListeningServer = LiveServer & {
  raw?: {
    ready?: () => Promise<unknown>;
    node?: {
      server?: {
        address: () => { port?: number } | string | null;
      };
    };
  };
};

type AcceptedBidBody = {
  sequence: number;
  amount: string;
  createdAt: string;
  participantNo: number;
  endsAt: string;
  extensionCount: number;
};

type LiveSocket = WebSocket & {
  new (
    url: string,
    options?: {
      headers?: Record<string, string>;
    },
  ): WebSocket;
};

type LiveClient = {
  socket: WebSocket;
  messages: PublicLotLiveMessage[];
  rawMessages: string[];
  opened: Promise<void>;
  nextMessage: () => Promise<PublicLotLiveMessage>;
  close: () => Promise<void>;
};

type LiveWire = {
  sendText: (text: string) => void;
  nextTextFrame: () => Promise<string>;
  framesBefore: (payload: string) => Promise<LiveFrame[]>;
  close: () => Promise<void>;
};

let liveServer: LiveServer | undefined;

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

const baseUrl = requiredEnv("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL);
const pageOrigin = requiredEnv("PAGE_ORIGIN", process.env.PAGE_ORIGIN);

function request(
  path: string,
  headers?: RequestInit["headers"],
  method = "GET",
  body?: string,
) {
  return new Request(`${baseUrl}${path}`, {
    method,
    headers,
    body,
  });
}

function boundPort(info: ListeningServer) {
  const address = info.raw?.node?.server?.address();

  if (address === null || address === undefined || typeof address !== "object") {
    return undefined;
  }

  return address.port;
}

function liveUrl(lotId: string) {
  if (liveServer === undefined || liveServer.port === 0) {
    throw new Error("Live server is not listening");
  }

  const hostname =
    liveServer.hostname === "::" ? "127.0.0.1" : liveServer.hostname;

  return `ws://${hostname}:${liveServer.port}/public/lots/${lotId}/live`;
}

function openSocket(lotId: string, headers?: Record<string, string>) {
  const url = liveUrl(lotId);

  if (headers === undefined) {
    return new WebSocket(url);
  }

  const Socket = WebSocket as unknown as LiveSocket;

  return new Socket(url, { headers });
}

function connectLive(lotId: string, headers?: Record<string, string>) {
  const socket = openSocket(lotId, headers);
  const messages: PublicLotLiveMessage[] = [];
  const rawMessages: string[] = [];
  const waiters: Array<(message: PublicLotLiveMessage) => void> = [];
  let cursor = 0;

  function push(message: PublicLotLiveMessage) {
    messages.push(message);

    const waiter = waiters.shift();

    if (waiter !== undefined) {
      cursor += 1;
      waiter(message);
    }
  }

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      throw new Error("Live lot message was not text");
    }

    rawMessages.push(event.data);
    push(JSON.parse(event.data) as PublicLotLiveMessage);
  });
  socket.addEventListener("error", () => {
    // A rejected upgrade emits error. Callers that expect it handle close.
  });

  let didOpen = false;
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => {
      didOpen = true;
      resolve();
    });
    socket.addEventListener("close", () => {
      if (!didOpen) {
        reject(new Error("WebSocket connection failed"));
      }
    });
  });
  const client: LiveClient = {
    socket,
    messages,
    rawMessages,
    opened,
    nextMessage() {
      const pending = messages[cursor];

      if (pending !== undefined) {
        cursor += 1;
        return Promise.resolve(pending);
      }

      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    close() {
      if (
        socket.readyState === WebSocket.CLOSED ||
        socket.readyState === WebSocket.CLOSING
      ) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        socket.addEventListener("close", () => resolve());
        socket.close();
      });
    },
  };

  clients.push(client);

  return opened.then(() => client);
}

function encodeClientText(text: string) {
  const payload = Buffer.from(text);
  const mask = Buffer.from([0x11, 0x22, 0x33, 0x44]);
  const masked = Buffer.alloc(payload.length);

  if (payload.length > 125) {
    throw new Error("Live wire only sends short client frames");
  }

  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % mask.length];
  }

  return Buffer.concat([
    Buffer.from([0x81, 0x80 | payload.length]),
    mask,
    masked,
  ]);
}

function openLiveWire(lotId: string) {
  if (liveServer === undefined || liveServer.port === 0) {
    throw new Error("Live server is not listening");
  }

  const socket = connectTcp({
    host: "127.0.0.1",
    port: liveServer.port,
  });
  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  const frames: LiveFrame[] = [];
  let cursor = 0;
  const textWaiters: Array<(payload: string) => void> = [];
  const barrierWaiters: Array<{
    payload: string;
    resolve: (frames: LiveFrame[]) => void;
  }> = [];

  function textIndex() {
    return frames.findIndex(
      (frame, index) =>
        index >= cursor && frame.opcode === websocketTextOpcode,
    );
  }

  function barrierIndex(payload: string) {
    return frames.findIndex(
      (frame, index) =>
        index >= cursor &&
        frame.opcode === websocketTextOpcode &&
        frame.payload === payload,
    );
  }

  function flush() {
    while (textWaiters.length > 0) {
      const index = textIndex();

      if (index === -1) {
        break;
      }

      const waiter = textWaiters.shift();
      const payload = frames[index]?.payload;

      cursor = index + 1;
      waiter?.(payload ?? "");
    }

    let waiterIndex = 0;

    while (waiterIndex < barrierWaiters.length) {
      const waiter = barrierWaiters[waiterIndex];
      const index = barrierIndex(waiter.payload);

      if (index === -1) {
        waiterIndex += 1;
        continue;
      }

      const leading = frames.slice(cursor, index);

      cursor = index + 1;
      barrierWaiters.splice(waiterIndex, 1);
      waiter.resolve(leading);
    }
  }

  function takeChunk(chunk: Buffer) {
    buffer = Buffer.concat([buffer, chunk]);

    if (!handshakeDone) {
      const headerEnd = buffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return false;
      }

      const header = buffer.subarray(0, headerEnd).toString("utf8");

      buffer = buffer.subarray(headerEnd + 4);
      handshakeDone = true;

      if (!header.startsWith("HTTP/1.1 101")) {
        socket.destroy();
        throw new Error(`Live wire upgrade failed: ${header}`);
      }
    }

    const parsed = readLiveFrames(buffer);

    buffer = Buffer.from(parsed.rest);
    frames.push(...parsed.frames);
    flush();

    return true;
  }

  const ready = new Promise<void>((resolve, reject) => {
    socket.on("error", reject);
    socket.on("data", (chunk: Buffer) => {
      try {
        if (takeChunk(chunk) && handshakeDone) {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  });

  const wire: LiveWire = {
    sendText(text) {
      socket.write(encodeClientText(text));
    },
    nextTextFrame() {
      const index = textIndex();

      if (index !== -1) {
        const payload = frames[index]?.payload ?? "";

        cursor = index + 1;
        return Promise.resolve(payload);
      }

      return new Promise((resolve) => {
        textWaiters.push(resolve);
      });
    },
    framesBefore(payload) {
      const index = barrierIndex(payload);

      if (index !== -1) {
        const leading = frames.slice(cursor, index);

        cursor = index + 1;
        return Promise.resolve(leading);
      }

      return new Promise((resolve) => {
        barrierWaiters.push({
          payload,
          resolve,
        });
      });
    },
    close() {
      if (socket.destroyed) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        socket.once("close", () => resolve());
        socket.end();
      });
    },
  };

  wires.push(wire);
  socket.write(liveWireHandshake(lotId));

  return ready.then(() => wire);
}

function liveWireHandshake(lotId: string) {
  const key = Buffer.from("1234567890123456").toString("base64");

  return [
    `GET /public/lots/${lotId}/live HTTP/1.1`,
    "Host: 127.0.0.1",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n");
}

function upgradeRequest(path: string, headers?: Record<string, string>) {
  if (liveServer === undefined) {
    throw new Error("Live server is not listening");
  }

  const port = liveServer.port;

  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        headers: {
          connection: "Upgrade",
          upgrade: "websocket",
          "sec-websocket-key": Buffer.from("1234567890123456").toString(
            "base64",
          ),
          "sec-websocket-version": "13",
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("upgrade", (_response, socket) => {
      socket.destroy();
      reject(new Error("The room accepted the upgrade"));
    });
    req.on("error", reject);
    req.end();
  });
}

async function registerUser(role: "BIDDER" | "AUCTIONEER", name: string) {
  const email = `live-${role.toLowerCase()}-${crypto.randomUUID()}@example.com`;
  const response = await app.handle(
    request(
      "/api/auth/sign-up/email",
      {
        "content-type": "application/json",
        origin: pageOrigin,
      },
      "POST",
      JSON.stringify({
        name,
        email,
        password,
        role,
      }),
    ),
  );
  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Sign-up failed with status ${response.status}: ${rawBody}`,
    );
  }

  const body = JSON.parse(rawBody) as {
    user?: {
      id?: string;
    };
  };
  const userId = body.user?.id;
  const token = response.headers.get("set-auth-token");

  if (!userId || !token) {
    throw new Error("Sign-up did not return a session");
  }

  createdUserIds.push(userId);

  return {
    email,
    name,
    userId,
    token,
  };
}

async function fundWallet(userId: string, totalBalance: string) {
  await db
    .update(wallet)
    .set({ totalBalance })
    .where(eq(wallet.userId, userId));
}

async function insertLot(
  auctioneerId: string,
  schedule: {
    startsAt: Date;
    endsAt: Date;
  },
) {
  const rows = await db
    .insert(lot)
    .values({
      auctioneerId,
      title: `Live room ${crypto.randomUUID()}`,
      description: null,
      openingBid: "10.00",
      minIncrement: "1.00",
      startsAt: schedule.startsAt,
      originalEndsAt: schedule.endsAt,
      endsAt: schedule.endsAt,
    })
    .returning({
      id: lot.id,
      startsAt: lot.startsAt,
      endsAt: lot.endsAt,
    });
  const row = rows[0];

  if (!row) {
    throw new Error("Insert lot did not return a row");
  }

  createdLotIds.push(row.id);

  return row;
}

function liveLotSchedule(endsInMs: number, startsInMs = -60_000) {
  return {
    startsAt: new Date(Date.now() + startsInMs),
    endsAt: new Date(Date.now() + endsInMs),
  };
}

async function makeLotDue(lotId: string) {
  const endsAt = new Date(Date.now() - 1_000);
  const originalEndsAt = new Date(endsAt.getTime() - 1_000);
  const startsAt = new Date(originalEndsAt.getTime() - 60_000);

  await db
    .update(lot)
    .set({
      startsAt,
      originalEndsAt,
      endsAt,
    })
    .where(eq(lot.id, lotId));
}

function postBid(token: string, lotId: string, amount: string) {
  return app.handle(
    request(
      `/private/lots/${lotId}/bids`,
      {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      "POST",
      JSON.stringify({ amount }),
    ),
  );
}

function postCancel(token: string, lotId: string) {
  return app.handle(
    request(`/private/lots/${lotId}/cancel`, {
      authorization: `Bearer ${token}`,
    }, "POST"),
  );
}

function expectPrivateText(raw: string, secrets: string[]) {
  for (const secret of secrets) {
    expect(secret.length).toBeGreaterThan(0);
    expect(raw).not.toContain(secret);
  }
}

function collectKeys(value: unknown, found: Set<string>) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectKeys(entry, found);
    }

    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    found.add(key);
    collectKeys(entry, found);
  }
}

function expectPublicKeys(message: PublicLotLiveMessage) {
  const keys = new Set<string>();

  collectKeys(message, keys);
  expect(message).not.toHaveProperty("viewerParticipantNo");
  expect(keys.has("viewerParticipantNo")).toBe(false);
  expect(keys.has("winnerId")).toBe(false);
  expect(keys.has("userId")).toBe(false);
  expect(keys.has("email")).toBe(false);
  expect(keys.has("hash")).toBe(false);
  expect(keys.has("shareToken")).toBe(false);
  expect(keys.has("totalBalance")).toBe(false);
  expect(keys.has("bidderId")).toBe(false);
  expect(keys.has("auctioneerId")).toBe(false);
}

async function cleanup() {
  if (createdLotIds.length > 0) {
    await db
      .update(lot)
      .set({ currentBidId: null, winnerId: null })
      .where(inArray(lot.id, createdLotIds));
    await db.delete(receipt).where(inArray(receipt.lotId, createdLotIds));
    await db
      .delete(walletMovement)
      .where(inArray(walletMovement.lotId, createdLotIds));
    await db.delete(bid).where(inArray(bid.lotId, createdLotIds));
    await db
      .delete(lotParticipant)
      .where(inArray(lotParticipant.lotId, createdLotIds));
    await db.delete(lot).where(inArray(lot.id, createdLotIds));
  }

  if (createdUserIds.length > 0) {
    const wallets = await db
      .select({ id: wallet.id })
      .from(wallet)
      .where(inArray(wallet.userId, createdUserIds));
    const walletIds = wallets.map((entry) => entry.id);

    if (walletIds.length > 0) {
      await db
        .delete(walletMovement)
        .where(inArray(walletMovement.walletId, walletIds));
      await db.delete(wallet).where(inArray(wallet.id, walletIds));
    }

    await db.delete(user).where(inArray(user.id, createdUserIds));
  }

  createdLotIds.length = 0;
  createdUserIds.length = 0;
}

describe("public lot live room", () => {
  beforeAll(async () => {
    const info = await new Promise<ListeningServer>((resolve) => {
      app.listen({ hostname: "127.0.0.1", port: 0 }, (server) => {
        resolve(server as ListeningServer);
      });
    });

    await info.raw?.ready?.();

    const port = boundPort(info);

    if (port === undefined || port === 0) {
      throw new Error("Live server did not bind a port");
    }

    liveServer = {
      hostname: "127.0.0.1",
      port,
      stop: () => info.stop(),
    };
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(wires.splice(0).map((wire) => wire.close()));
    await cleanup();
  });

  afterAll(async () => {
    await liveServer?.stop();
    await db.$client.end();
  });

  describe("when a client connects", () => {
    it("sends the current public lot without the viewer participant number", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const startsAt = new Date(Date.now() + 60 * 60 * 1000);
      const stored = await insertLot(auctioneer.userId, {
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      });
      const httpResponse = await app.handle(
        request(`/public/lots/${stored.id}`, {
          origin: pageOrigin,
        }),
      );
      const httpBody = (await httpResponse.json()) as {
        viewerParticipantNo?: number | null;
        lot?: PublicLotLiveMessage["lot"];
      };
      const client = await connectLive(stored.id, { origin: pageOrigin });
      const message = await client.nextMessage();

      expect(httpResponse.status).toBe(200);
      expect(httpBody.viewerParticipantNo).toBeNull();
      expect(Object.keys(message).sort()).toEqual(["lot", "serverNow"]);
      expect(message.lot).toEqual(httpBody.lot);
      expect(message.serverNow).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(message.lot.status).toBe("SCHEDULED");
      expect(message.lot.openingBid).toBe("10.00");
      expect(message.lot.bids).toEqual([]);
      expectPublicKeys(message);
      expectPrivateText(client.rawMessages.join("\n"), [
        auctioneer.email,
        auctioneer.name,
        auctioneer.userId,
      ]);
    });

    it("connects when the request has no origin", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(60 * 60 * 1000),
      );
      const client = await connectLive(stored.id);
      const message = await client.nextMessage();

      expect(message.lot.id).toBe(stored.id);
      expect(message.lot.status).toBe("LIVE");
    });

    it("does not open a room for an unknown lot", async () => {
      const response = await upgradeRequest(
        `/public/lots/${crypto.randomUUID()}/live`,
      );
      const body = JSON.parse(response.body) as { code?: string };

      expect(response.status).toBe(404);
      expect(body.code).toBe("LOT_NOT_FOUND");
    });

    it("does not open a room when the id is not a uuid", async () => {
      const response = await upgradeRequest("/public/lots/not-a-uuid/live");

      expect(response.status).toBe(422);
    });

    it("rejects a browser origin other than the page", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(60 * 60 * 1000),
      );
      // Node's WebSocket client stays CONNECTING and may never emit
      // error or close when the handshake is refused. The browser
      // request is this HTTP upgrade, which carries the rejection.
      const response = await upgradeRequest(`/public/lots/${stored.id}/live`, {
        origin: "https://evil.example",
      });
      const body = JSON.parse(response.body) as { code?: string };

      expect(response.status).toBe(403);
      expect(body.code).toBe("ORIGIN_NOT_ALLOWED");
    });
  });

  describe("when the client sends a message", () => {
    it("does not answer, including when the text contains ping", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );
      const wire = await openLiveWire(stored.id);
      const snapshot = JSON.parse(
        await wire.nextTextFrame(),
      ) as PublicLotLiveMessage;

      wire.sendText("ping");
      wire.sendText('{"command":"bid","amount":"10.00"}');

      const payloadAfterClientMessage = await publishPublicLot(stored.id);

      if (payloadAfterClientMessage === null) {
        throw new Error("The room had no subscriber after the client message");
      }

      const leading = await wire.framesBefore(payloadAfterClientMessage);
      const opcodes = leading.map((frame) => frame.opcode);

      expect(snapshot.lot.id).toBe(stored.id);
      expect(snapshot).not.toHaveProperty("viewerParticipantNo");
      expect(opcodes).not.toContain(websocketTextOpcode);
      expect(opcodes).not.toContain(websocketPingOpcode);
      expect(opcodes).not.toContain(websocketPongOpcode);
      expect(opcodes).not.toContain(websocketCloseOpcode);
    });
  });

  describe("when a bid is accepted", () => {
    it("sends the same bid, leader, and end time to every client in the room", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );

      await fundWallet(bidder.userId, "100.00");

      const first = await connectLive(stored.id);
      const second = await connectLive(stored.id);

      await first.nextMessage();
      await second.nextMessage();

      const response = await postBid(bidder.token, stored.id, "10.00");
      const accepted = (await response.json()) as AcceptedBidBody;
      const left = await first.nextMessage();
      const right = await second.nextMessage();

      expect(response.status).toBe(201);
      expect(first.rawMessages[1]).toBe(second.rawMessages[1]);
      expect(left).toEqual(right);
      expect(left.lot.currentBid).toBe(accepted.amount);
      expect(left.lot.leaderParticipantNo).toBe(accepted.participantNo);
      expect(left.lot.endsAt).toBe(accepted.endsAt);
      expect(left.lot.extensionCount).toBe(accepted.extensionCount);
      expect(left.lot.bids).toEqual([
        {
          sequence: accepted.sequence,
          amount: accepted.amount,
          createdAt: accepted.createdAt,
          participantNo: accepted.participantNo,
        },
      ]);
      expect(Object.keys(left.lot.bids[0] ?? {}).sort()).toEqual([
        "amount",
        "createdAt",
        "participantNo",
        "sequence",
      ]);
    });

    it("does not send that bid to a client in another room", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const watched = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );
      const other = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );

      await fundWallet(bidder.userId, "100.00");

      const insider = await connectLive(watched.id);
      const outsider = await connectLive(other.id);

      await insider.nextMessage();
      await outsider.nextMessage();
      await postBid(bidder.token, watched.id, "10.00");

      const watchedUpdate = await insider.nextMessage();
      const otherResponse = await postBid(bidder.token, other.id, "12.00");
      const otherUpdate = await outsider.nextMessage();

      expect(otherResponse.status).toBe(201);
      expect(watchedUpdate.lot.id).toBe(watched.id);
      expect(outsider.messages).toHaveLength(2);
      expect(otherUpdate.lot.id).toBe(other.id);
      expect(otherUpdate.lot.currentBid).toBe("12.00");
      expect(outsider.rawMessages[1]).not.toBe(insider.rawMessages[1]);
    });
  });

  describe("when a bid is rejected", () => {
    it("does not send a new message", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );

      await fundWallet(bidder.userId, "100.00");

      const client = await connectLive(stored.id);

      await client.nextMessage();
      client.socket.send(JSON.stringify({ amount: "10.00" }));

      const rejected = await postBid(bidder.token, stored.id, "9.00");
      const accepted = await postBid(bidder.token, stored.id, "10.00");
      const update = await client.nextMessage();

      expect(rejected.status).toBe(409);
      expect(accepted.status).toBe(201);
      expect(update.lot.bidCount).toBe(1);
      expect(update.lot.currentBid).toBe("10.00");
      expect(client.messages).toHaveLength(2);
    });
  });

  describe("when a client reconnects", () => {
    it("sends the bid and end time that happened while it was away", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(60_000),
      );

      await fundWallet(bidder.userId, "100.00");

      const away = await connectLive(stored.id);
      const before = await away.nextMessage();

      await away.close();

      const response = await postBid(bidder.token, stored.id, "10.00");
      const accepted = (await response.json()) as AcceptedBidBody;
      const client = await connectLive(stored.id);
      const current = await client.nextMessage();

      expect(response.status).toBe(201);
      expect(accepted.extensionCount).toBe(1);
      expect(current.lot.endsAt).toBe(accepted.endsAt);
      expect(current.lot.endsAt).not.toBe(before.lot.endsAt);
      expect(current.lot.extensionCount).toBe(1);
      expect(current.lot.leaderParticipantNo).toBe(accepted.participantNo);
      expect(current.lot.bids).toEqual([
        {
          sequence: accepted.sequence,
          amount: accepted.amount,
          createdAt: accepted.createdAt,
          participantNo: accepted.participantNo,
        },
      ]);
    });
  });

  describe("when the lot is canceled", () => {
    it("tells the room and keeps the accepted bids", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );

      await fundWallet(bidder.userId, "100.00");

      const client = await connectLive(stored.id);

      await client.nextMessage();

      const bidResponse = await postBid(bidder.token, stored.id, "10.00");
      const accepted = (await bidResponse.json()) as AcceptedBidBody;

      await client.nextMessage();

      const cancelResponse = await postCancel(auctioneer.token, stored.id);
      const canceled = await client.nextMessage();

      expect(cancelResponse.status).toBe(200);
      expect(canceled.lot.status).toBe("CANCELED");
      expect(canceled.lot.winnerParticipantNo).toBeNull();
      expect(canceled.lot.bids).toEqual([
        {
          sequence: accepted.sequence,
          amount: accepted.amount,
          createdAt: accepted.createdAt,
          participantNo: accepted.participantNo,
        },
      ]);
    });

    it("does not publish a repeated cancellation", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );
      const client = await connectLive(stored.id);

      await client.nextMessage();
      await postCancel(auctioneer.token, stored.id);

      const canceled = await client.nextMessage();
      const before = client.rawMessages.length;
      const repeated = await postCancel(auctioneer.token, stored.id);
      const payloadAfterRepeatedCancel = await publishPublicLot(stored.id);

      if (payloadAfterRepeatedCancel === null) {
        throw new Error(
          "The room had no subscriber after the repeated cancellation",
        );
      }

      const published = await client.nextMessage();

      expect(repeated.status).toBe(200);
      expect(canceled.lot.status).toBe("CANCELED");
      expect(client.rawMessages.indexOf(payloadAfterRepeatedCancel)).toBe(
        before,
      );
      expect(client.rawMessages).toHaveLength(before + 1);
      expect(
        client.rawMessages.filter(
          (entry) => entry === payloadAfterRepeatedCancel,
        ),
      ).toHaveLength(1);
      expect(published.lot.status).toBe("CANCELED");
    });
  });

  describe("when the lot is settled", () => {
    it("tells the room the winner participant number", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );

      await fundWallet(bidder.userId, "100.00");

      const client = await connectLive(stored.id);

      await client.nextMessage();

      const bidResponse = await postBid(bidder.token, stored.id, "10.00");
      const accepted = (await bidResponse.json()) as AcceptedBidBody;

      await client.nextMessage();
      await makeLotDue(stored.id);
      await settleDueLots();

      const ended = await client.nextMessage();
      const [storedReceipt] = await db
        .select({
          shareToken: receipt.shareToken,
          winnerId: receipt.winnerId,
        })
        .from(receipt)
        .where(eq(receipt.lotId, stored.id));
      const [storedBid] = await db
        .select({
          hash: bid.hash,
          previousHash: bid.previousHash,
        })
        .from(bid)
        .where(eq(bid.lotId, stored.id));

      expect(bidResponse.status).toBe(201);
      expect(ended.lot.status).toBe("ENDED");
      expect(ended.lot.sold).toBe(true);
      expect(ended.lot.winnerParticipantNo).toBe(accepted.participantNo);
      expect(ended.lot.bids).toHaveLength(1);

      if (storedReceipt === undefined || storedBid === undefined) {
        throw new Error("Settlement did not persist the receipt and winning bid");
      }

      expect(storedReceipt.shareToken).toEqual(expect.any(String));
      expect(storedBid.hash).toEqual(expect.any(String));
      expectPrivateText(client.rawMessages.join("\n"), [
        auctioneer.email,
        auctioneer.name,
        auctioneer.userId,
        bidder.email,
        bidder.name,
        bidder.userId,
        storedReceipt.shareToken,
        storedReceipt.winnerId,
        storedBid.hash,
        storedBid.previousHash,
      ]);
      expectPublicKeys(ended);
    });

    it("tells the room the lot ended when nobody bid", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );
      const client = await connectLive(stored.id);
      const before = await client.nextMessage();

      await makeLotDue(stored.id);
      await settleDueLots();

      const ended = await client.nextMessage();

      expect(before.lot.status).toBe("LIVE");
      expect(ended.lot.status).toBe("ENDED");
      expect(ended.lot.sold).toBe(false);
      expect(ended.lot.winnerParticipantNo).toBeNull();
      expect(ended.lot.currentBid).toBeNull();
      expect(ended.lot.leaderParticipantNo).toBeNull();
      expect(ended.lot.bidCount).toBe(0);
      expect(ended.lot.bids).toEqual([]);
    });

    it("does not publish when the lot is still running", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );

      await fundWallet(bidder.userId, "100.00");

      const client = await connectLive(stored.id);

      await client.nextMessage();
      await settleDueLots();

      const response = await postBid(bidder.token, stored.id, "10.00");
      const update = await client.nextMessage();

      expect(response.status).toBe(201);
      expect(update.lot.status).toBe("LIVE");
      expect(update.lot.bidCount).toBe(1);
      expect(client.messages).toHaveLength(2);
    });
  });

  describe("privacy", () => {
    it("does not include email, name, or user id in any message", async () => {
      const auctioneer = await registerUser("AUCTIONEER", auctioneerName);
      const bidder = await registerUser("BIDDER", bidderName);
      const stored = await insertLot(
        auctioneer.userId,
        liveLotSchedule(24 * 60 * 60 * 1000),
      );

      await fundWallet(bidder.userId, "100.00");

      const client = await connectLive(stored.id);

      await client.nextMessage();
      await postBid(bidder.token, stored.id, "10.00");
      await client.nextMessage();

      const [storedBid] = await db
        .select({
          hash: bid.hash,
          previousHash: bid.previousHash,
          bidderId: bid.bidderId,
        })
        .from(bid)
        .where(eq(bid.lotId, stored.id));
      const raw = client.rawMessages.join("\n");

      expect(client.messages).toHaveLength(2);
      expect(storedBid?.bidderId).toBe(bidder.userId);
      expectPrivateText(raw, [
        auctioneer.email,
        auctioneer.name,
        auctioneer.userId,
        bidder.email,
        bidder.name,
        bidder.userId,
        storedBid?.hash ?? "",
        storedBid?.previousHash ?? "",
      ]);

      for (const message of client.messages) {
        expectPublicKeys(message);
      }
    });
  });
});
