export type ListedLotItem = {
  id: string;
  position: number;
  cardId: number;
  quantity: number;
  cardName: string;
  imagePath: string;
};

export type ShownLotItem = ListedLotItem & {
  cardSnapshot: Record<string, unknown>;
};

export type ShownLotBid = {
  sequence: number;
  amount: string;
  createdAt: Date;
  participantNo: number;
};
