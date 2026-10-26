//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import {
  listPublicLotsQuerySchema,
  listPublicLotsResponseSchema,
} from "../../schemas/list-lots";

//* Services imports
import { listPublicLots } from "../../services/lots/list-public-lots";

const publicLotRoutes = new Elysia({ prefix: "/lots" }).get(
  "/",
  async ({ query }) => {
    const lots = await listPublicLots(query);

    return { lots };
  },
  {
    query: listPublicLotsQuerySchema,
    response: listPublicLotsResponseSchema,
  },
);

export { publicLotRoutes };
