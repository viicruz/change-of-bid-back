//* Libraries imports
import { and, eq } from "drizzle-orm";

//* Schemas imports
import type { ShowPublicLotStatus } from "../../schemas/show-lot";

//* Local imports
import { lotParticipant } from "../../db/schema";
import type { DatabaseExecutor } from "../../models/executor";
import {
  findShownLot,
  loadShownLotItems,
  loadShownLotBids,
  presentShownLot,
  runLotRead,
} from "./lot-read";

const showPublicLotErrorCodes = ["LOT_NOT_FOUND"] as const;

export type ShowPublicLotErrorCode = (typeof showPublicLotErrorCodes)[number];

export class ShowPublicLotError extends Error {
  readonly code: ShowPublicLotErrorCode;

  constructor(code: ShowPublicLotErrorCode, message: string) {
    super(message);
    this.name = "ShowPublicLotError";
    this.code = code;
  }
}

export type ShownPublicLotItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
  cardSnapshot: Record<string, unknown>;
};

export type ShownPublicLotBid = {
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
};

export type ShownPublicLot = {
  serverNow: Date;
  viewerParticipantNo: number | null;
  lot: {
    id: string;
    title: string;
    description: string | null;
    openingBid: string;
    minIncrement: string;
    startsAt: Date;
    endsAt: Date;
    extensionCount: number;
    status: ShowPublicLotStatus;
    currentBid: string | null;
    leaderParticipantNo: number | null;
    bidCount: number;
    sold: boolean;
    winnerParticipantNo: number | null;
    items: ShownPublicLotItem[];
    bids: ShownPublicLotBid[];
  };
};

export type ShowPublicLotDependencies = {
  now: () => Date;
  viewerId: string | null;
  runInTransaction: <Result>(
    work: (executor: DatabaseExecutor) => Promise<Result>,
  ) => Promise<Result>;
};

export async function showPublicLot(
  lotId: string,
  dependencies: Partial<ShowPublicLotDependencies> = {},
): Promise<ShownPublicLot> {
  const resolved: ShowPublicLotDependencies = {
    ...createDefaultDependencies(),
    ...dependencies,
  };
  const now = resolved.now();

  return resolved.runInTransaction(async (executor) => {
    const row = await findShownLot(executor, lotId, now);

    if (row === null) {
      throw new ShowPublicLotError("LOT_NOT_FOUND", "Lot was not found.");
    }

    const items = await loadShownLotItems(executor, lotId);
    const bids = await loadShownLotBids(executor, lotId);
    const viewerParticipantNo = await findViewerParticipantNo(
      executor,
      lotId,
      resolved.viewerId,
    );
    return {
      serverNow: now,
      viewerParticipantNo,
      lot: presentShownLot(row, items, bids),
    };
  });
}

function createDefaultDependencies(): ShowPublicLotDependencies {
  return {
    now: () => new Date(),
    viewerId: null,
    runInTransaction: runLotRead,
  };
}

async function findViewerParticipantNo(
  executor: DatabaseExecutor,
  lotId: string,
  viewerId: string | null,
) {
  if (viewerId === null) {
    return null;
  }

  const rows = await executor
    .select({ participantNo: lotParticipant.participantNo })
    .from(lotParticipant)
    .where(
      and(eq(lotParticipant.lotId, lotId), eq(lotParticipant.userId, viewerId)),
    );

  return rows[0]?.participantNo ?? null;
}

export const runShowPublicLotRead = runLotRead;
