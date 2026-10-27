//* Services imports
import { showPublicLot } from "./show-public-lot";
import { toPublicLotLiveMessage } from "./public-lot-live-message";

type PublicLotLiveSubscriber = {
  send: (payload: string) => void;
};

const rooms = new Map<string, Set<PublicLotLiveSubscriber>>();
const deliveries = new Map<string, Promise<void>>();

function isLiveRoomEmpty(lotId: string) {
  const room = rooms.get(lotId);

  return room === undefined || room.size === 0;
}

export async function publishPublicLot(lotId: string): Promise<string | null> {
  const pending = deliveries.get(lotId);

  // No listener and nothing waiting to read: skip the public query entirely.
  if (isLiveRoomEmpty(lotId) && pending === undefined) {
    return null;
  }

  return enqueue(lotId, () => deliverPublicLot(lotId));
}

export function joinPublicLotRoom(
  lotId: string,
  send: (payload: string) => void,
): Promise<() => void> {
  let ready = false;
  const subscriber: PublicLotLiveSubscriber = {
    send(payload) {
      // A broadcast queued ahead of this snapshot is dropped. The snapshot
      // read runs after it, so the committed state is already included.
      if (!ready) {
        return;
      }

      send(payload);
    },
  };
  const unsubscribe = addSubscriber(lotId, subscriber);

  return enqueue(lotId, async () => {
    try {
      send(await readPublicLotLivePayload(lotId));
      ready = true;

      return unsubscribe;
    } catch (error) {
      unsubscribe();
      throw error;
    }
  });
}

function addSubscriber(lotId: string, subscriber: PublicLotLiveSubscriber) {
  const room = rooms.get(lotId) ?? new Set<PublicLotLiveSubscriber>();

  room.add(subscriber);
  rooms.set(lotId, room);

  return () => {
    room.delete(subscriber);

    if (room.size === 0) {
      rooms.delete(lotId);
    }
  };
}

function enqueue<Result>(lotId: string, work: () => Promise<Result>) {
  const previous = deliveries.get(lotId) ?? Promise.resolve();
  const run = previous.then(work, work);
  const idle = run.then(
    () => undefined,
    () => undefined,
  );

  deliveries.set(lotId, idle);
  void idle.finally(() => {
    if (deliveries.get(lotId) === idle) {
      deliveries.delete(lotId);
    }
  });

  return run;
}

async function deliverPublicLot(lotId: string) {
  if (isLiveRoomEmpty(lotId)) {
    return null;
  }

  const payload = await readPublicLotLivePayload(lotId);
  const room = rooms.get(lotId);

  if (room === undefined || room.size === 0) {
    return null;
  }

  for (const subscriber of [...room]) {
    try {
      subscriber.send(payload);
    } catch {
      room.delete(subscriber);
    }
  }

  if (room.size === 0) {
    rooms.delete(lotId);
  }

  return payload;
}

async function readPublicLotLivePayload(lotId: string) {
  const shown = await showPublicLot(lotId, { viewerId: null });

  return JSON.stringify(toPublicLotLiveMessage(shown));
}
