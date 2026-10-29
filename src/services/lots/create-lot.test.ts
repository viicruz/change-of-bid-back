//* Libraries imports
import { describe } from "vitest";

//* Local imports
import { registerRejectedRequestCases } from "./__tests__/create-lot/rejected-request-cases";
import { registerValidRequestCases } from "./__tests__/create-lot/valid-request-cases";

describe("createLot", () => {
  registerValidRequestCases();
  registerRejectedRequestCases();
});
