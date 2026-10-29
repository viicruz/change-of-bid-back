//* Libraries imports
import { afterAll, afterEach, describe } from "vitest";

//* Local imports
import { db } from "../../db/index";
import {
  registerLeadingBidCases,
  registerLeadingBidWithCentsCases,
  registerOneMillisecondBeforeEndCases,
  registerRepeatedCancellationCases,
  registerScheduledLotCases,
} from "./__tests__/cancel-lot/cancelable-lot-cases";
import {
  registerConcurrentCancellationCases,
  registerEndingRaceCases,
} from "./__tests__/cancel-lot/concurrency-cases";
import { registerEndedLotCases } from "./__tests__/cancel-lot/ended-lot-cases";
import { cleanup } from "./__tests__/cancel-lot/fixtures";
import {
  registerLeaderOfAnotherLotCases,
  registerOutbidBidderCases,
} from "./__tests__/cancel-lot/multiple-bid-cases";
import {
  registerForeignLotCases,
  registerMissingLotCases,
  registerNonAuctioneerCases,
} from "./__tests__/cancel-lot/rejection-cases";

describe("cancelLot", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  registerScheduledLotCases();
  registerLeadingBidCases();
  registerRepeatedCancellationCases();
  registerNonAuctioneerCases();
  registerForeignLotCases();
  registerMissingLotCases();
  registerEndedLotCases();
  registerOneMillisecondBeforeEndCases();
  registerLeadingBidWithCentsCases();
  registerLeaderOfAnotherLotCases();
  registerOutbidBidderCases();
  registerConcurrentCancellationCases();
  registerEndingRaceCases();
});
