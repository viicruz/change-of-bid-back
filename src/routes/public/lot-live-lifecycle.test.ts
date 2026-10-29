//* Libraries imports
import { describe, expect, it, vi } from "vitest";

//* Local imports
import { PublicLotLiveLifecycle } from "./lot-live-lifecycle";

//* Services imports
import type { joinPublicLotRoom } from "../../services/lots/public-lot-live";

function createSocket() {
  return {
    raw: { context: { message: vi.fn() } },
    send: vi.fn<(payload: string) => void>(),
    close: vi.fn<(code: number, reason: string) => void>(),
  };
}

describe("public lot live lifecycle", () => {
  it("forwards room payloads and leaves once when the socket closes", async () => {
    const leave = vi.fn();
    const joinRoom = vi.fn<typeof joinPublicLotRoom>().mockResolvedValue(leave);
    const lifecycle = new PublicLotLiveLifecycle(joinRoom);
    const socket = createSocket();

    await lifecycle.open(socket, "lot-id");

    expect(joinRoom).toHaveBeenCalledExactlyOnceWith("lot-id", expect.any(Function));
    const send = joinRoom.mock.calls[0]![1];

    send('{"snapshot":true}');
    send('{"update":true}');

    expect(socket.send.mock.calls).toEqual([
      ['{"snapshot":true}'],
      ['{"update":true}'],
    ]);
    expect(leave).not.toHaveBeenCalled();

    lifecycle.close(socket);
    lifecycle.close(socket);

    expect(leave).toHaveBeenCalledExactlyOnceWith();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("leaves when a pending snapshot finishes after disconnection", async () => {
    const snapshot = Promise.withResolvers<() => void>();
    const leave = vi.fn();
    const joinRoom = vi.fn<typeof joinPublicLotRoom>().mockReturnValue(snapshot.promise);
    const lifecycle = new PublicLotLiveLifecycle(joinRoom);
    const socket = createSocket();
    const opening = lifecycle.open(socket, "lot-id");

    lifecycle.close(socket);
    lifecycle.close(socket);
    expect(leave).not.toHaveBeenCalled();

    snapshot.resolve(leave);
    await opening;
    lifecycle.close(socket);

    expect(leave).toHaveBeenCalledExactlyOnceWith();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("keeps another subscriber when one socket closes", async () => {
    const firstLeave = vi.fn();
    const secondLeave = vi.fn();
    const joinRoom = vi.fn<typeof joinPublicLotRoom>()
      .mockResolvedValueOnce(firstLeave)
      .mockResolvedValueOnce(secondLeave);
    const lifecycle = new PublicLotLiveLifecycle(joinRoom);
    const first = createSocket();
    const second = createSocket();

    await lifecycle.open(first, "lot-id");
    await lifecycle.open(second, "lot-id");
    lifecycle.close(first);

    expect(firstLeave).toHaveBeenCalledExactlyOnceWith();
    expect(secondLeave).not.toHaveBeenCalled();

    lifecycle.close(second);

    expect(secondLeave).toHaveBeenCalledExactlyOnceWith();
  });

  it("closes with 1011 and preserves a snapshot failure", async () => {
    const failure = new Error("Snapshot failed");
    const joinRoom = vi.fn<typeof joinPublicLotRoom>().mockRejectedValue(failure);
    const lifecycle = new PublicLotLiveLifecycle(joinRoom);
    const socket = createSocket();

    await expect(lifecycle.open(socket, "lot-id")).rejects.toBe(failure);

    expect(socket.close).toHaveBeenCalledExactlyOnceWith(
      1011,
      "The live lot snapshot failed",
    );
  });

  it("preserves a snapshot failure even if the disconnected socket cannot close", async () => {
    const snapshot = Promise.withResolvers<() => void>();
    const failure = new Error("Snapshot failed");
    const joinRoom = vi.fn<typeof joinPublicLotRoom>().mockReturnValue(snapshot.promise);
    const lifecycle = new PublicLotLiveLifecycle(joinRoom);
    const socket = createSocket();
    socket.close.mockImplementation(() => { throw new Error("Socket is gone"); });
    const opening = lifecycle.open(socket, "lot-id");
    const rejected = expect(opening).rejects.toBe(failure);

    lifecycle.close(socket);
    snapshot.reject(failure);

    await rejected;
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(
      1011,
      "The live lot snapshot failed",
    );
  });

  it("disables the adapter message handler before joining the room", async () => {
    const socket = createSocket();
    const message = socket.raw.context.message;
    const leave = vi.fn();
    const joinRoom = vi.fn<typeof joinPublicLotRoom>().mockImplementation(async () => {
      expect(socket.raw.context.message).not.toBe(message);
      return leave;
    });
    const lifecycle = new PublicLotLiveLifecycle(joinRoom);

    await lifecycle.open(socket, "lot-id");
    const ignoreMessage: (peer: unknown, body: string) => unknown = socket.raw.context.message;

    expect(ignoreMessage(socket.raw, "ping")).toBeUndefined();
    expect(ignoreMessage(socket.raw, '{"command":"bid"}')).toBeUndefined();
    expect(message).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
    lifecycle.close(socket);
    expect(leave).toHaveBeenCalledExactlyOnceWith();
  });

  it("rejects a socket without the adapter hook before subscribing", async () => {
    const joinRoom = vi.fn<typeof joinPublicLotRoom>();
    const lifecycle = new PublicLotLiveLifecycle(joinRoom);
    const socket = { ...createSocket(), raw: {} };

    await expect(lifecycle.open(socket, "lot-id")).rejects.toThrow(
      "Live room socket has no message hook",
    );

    expect(joinRoom).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
  });
});
