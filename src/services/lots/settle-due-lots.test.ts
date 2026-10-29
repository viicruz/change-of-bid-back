//* Libraries imports
import { afterAll, afterEach, describe } from "vitest";

//* Local imports
import { db } from "../../db/index";
import {
  registerLaterWinningBidCases,
  registerOtherLotReserveCases,
  registerWinningBidWithCentsCases,
} from "./__tests__/settle-due-lots/balance-cases";
import { registerBidRaceCases } from "./__tests__/settle-due-lots/bid-race-cases";
import { registerCancellationRaceCases } from "./__tests__/settle-due-lots/cancellation-race-cases";
import {
  registerCanceledLotCases,
  registerExtendedLotCases,
  registerOpenLotCases,
} from "./__tests__/settle-due-lots/eligibility-cases";
import { cleanup } from "./__tests__/settle-due-lots/fixtures";
import { registerPostCommitPublicationCases } from "./__tests__/settle-due-lots/publication-cases";
import { registerFinancialRollbackCases } from "./__tests__/settle-due-lots/rollback-cases";
import {
  registerNoBidCases,
  registerOverlappingSettlementCases,
  registerRepeatedSettlementCases,
  registerWinningBidCases,
} from "./__tests__/settle-due-lots/settlement-cases";
import {
  registerBrokenSiblingCases,
  registerInvalidReserveCases,
  registerWinnerValidationCases,
} from "./__tests__/settle-due-lots/validation-cases";

describe("settleDueLots", () => {
  afterEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  registerWinningBidCases();
  registerNoBidCases();
  registerRepeatedSettlementCases();
  registerOverlappingSettlementCases();
  registerCanceledLotCases();
  registerOpenLotCases();
  registerOtherLotReserveCases();
  registerWinningBidWithCentsCases();
  registerBidRaceCases();
  registerCancellationRaceCases();
  registerLaterWinningBidCases();
  registerExtendedLotCases();
  registerBrokenSiblingCases();
  registerInvalidReserveCases();
  registerFinancialRollbackCases();
  registerPostCommitPublicationCases();
  registerWinnerValidationCases();
});
