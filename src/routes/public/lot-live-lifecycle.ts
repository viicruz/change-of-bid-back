//* Services imports
import type { joinPublicLotRoom } from "../../services/lots/public-lot-live";

type LiveRoomSocket = {
  raw: object;
  send: (payload: string) => unknown;
  close: (code: number, reason: string) => unknown;
};

type LiveRoomPeer = {
  context?: {
    message?: (peer: unknown, body: string) => unknown;
  };
};

export class PublicLotLiveLifecycle {
  private readonly roomLeaves = new WeakMap<object, () => void>();
  private readonly closedSockets = new WeakSet<object>();

  constructor(private readonly joinRoom: typeof joinPublicLotRoom) {}

  async open(socket: LiveRoomSocket, lotId: string): Promise<void> {
    const raw = socket.raw;

    ignoreClientFrames(raw);

    try {
      const leave = await this.joinRoom(lotId, (payload) => {
        socket.send(payload);
      });

      // close can run while the initial snapshot is still being read.
      if (this.closedSockets.has(raw)) {
        leave();
        return;
      }

      this.roomLeaves.set(raw, leave);
    } catch (error) {
      try {
        socket.close(1011, "The live lot snapshot failed");
      } catch {
        // The socket is already gone.
      }

      throw error;
    }
  }

  close(socket: LiveRoomSocket): void {
    this.closedSockets.add(socket.raw);

    const leave = this.roomLeaves.get(socket.raw);

    if (leave === undefined) {
      return;
    }

    leave();
    this.roomLeaves.delete(socket.raw);
  }
}

// @elysiajs/node treats any text frame whose body contains "ping" as a
// heartbeat and handles it before the route. Drop every client frame on the
// socket hook so the room stays one-way.
function ignoreClientFrames(peer: object) {
  const context = (peer as LiveRoomPeer).context;

  if (context === undefined) {
    throw new Error("Live room socket has no message hook");
  }

  context.message = () => undefined;
}
