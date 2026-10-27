//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import {
  depositBodySchema,
  depositForbiddenSchema,
  depositUnprocessableSchema,
  listWalletMovementsQuerySchema,
  listWalletMovementsResponseSchema,
  walletNotFoundSchema,
  walletResponseSchema,
} from "../../schemas/wallet";

//* Local imports
import { betterAuthMacro } from "../../lib/auth";

//* Services imports
import {
  deposit,
  DepositError,
  type DepositErrorCode,
} from "../../services/wallet/deposit";
import { getWallet, GetWalletError } from "../../services/wallet/get-wallet";
import {
  listWalletMovements,
  ListWalletMovementsError,
} from "../../services/wallet/list-wallet-movements";

const depositErrorStatus = {
  NOT_BIDDER: 403,
  WALLET_NOT_FOUND: 404,
  INVALID_MONEY: 422,
  AMOUNT_OUT_OF_RANGE: 422,
} as const satisfies Record<DepositErrorCode, 403 | 404 | 422>;

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
  .post(
    "/deposits",
    async ({ body, user, status }) => {
      try {
        const deposited = await deposit({
          userId: user.id,
          role: user.role,
          amount: body.amount,
        });

        return status(201, deposited);
      } catch (error) {
        if (!(error instanceof DepositError)) {
          throw error;
        }

        return status(depositErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      auth: true,
      body: depositBodySchema,
      response: {
        201: walletResponseSchema,
        403: depositForbiddenSchema,
        404: walletNotFoundSchema,
        422: depositUnprocessableSchema,
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
