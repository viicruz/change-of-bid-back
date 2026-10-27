//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import {
  listWalletMovementsQuerySchema,
  listWalletMovementsResponseSchema,
  walletNotFoundSchema,
  walletResponseSchema,
} from "../../schemas/wallet";

//* Local imports
import { betterAuthMacro } from "../../lib/auth";

//* Services imports
import { getWallet, GetWalletError } from "../../services/wallet/get-wallet";
import {
  listWalletMovements,
  ListWalletMovementsError,
} from "../../services/wallet/list-wallet-movements";

const walletRoutes = new Elysia({ prefix: "/wallet" })
  .use(betterAuthMacro)
  .get(
    "/",
    async ({ user, status }) => {
      try {
        return await getWallet({ userId: user.id });
      } catch (error) {
        if (!(error instanceof GetWalletError)) {
          throw error;
        }

        return status(404, {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      auth: true,
      response: {
        200: walletResponseSchema,
        404: walletNotFoundSchema,
      },
    },
  )
  .get(
    "/movements",
    async ({ query, user, status }) => {
      try {
        return await listWalletMovements({
          ...query,
          userId: user.id,
        });
      } catch (error) {
        if (!(error instanceof ListWalletMovementsError)) {
          throw error;
        }

        return status(404, {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      auth: true,
      query: listWalletMovementsQuerySchema,
      response: {
        200: listWalletMovementsResponseSchema,
        404: walletNotFoundSchema,
      },
    },
  );

export { walletRoutes };
