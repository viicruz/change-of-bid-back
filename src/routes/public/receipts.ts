//* Libraries imports
import { Elysia } from "elysia";

//* Schemas imports
import {
  showPublicReceiptNotFoundSchema,
  showPublicReceiptParamsSchema,
  showPublicReceiptResponseSchema,
} from "../../schemas/show-receipt";

//* Services imports
import {
  showPublicReceipt,
  ShowPublicReceiptError,
  type ShowPublicReceiptErrorCode,
} from "../../services/lots/show-public-receipt";

const showPublicReceiptErrorStatus = {
  RECEIPT_NOT_FOUND: 404,
} as const satisfies Record<ShowPublicReceiptErrorCode, 404>;

const publicReceiptRoutes = new Elysia({ prefix: "/receipts" })
  .get(
    "/:shareToken",
    async ({ params, status }) => {
      try {
        return await showPublicReceipt(params.shareToken);
      } catch (error) {
        if (!(error instanceof ShowPublicReceiptError)) {
          throw error;
        }

        return status(showPublicReceiptErrorStatus[error.code], {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      params: showPublicReceiptParamsSchema,
      response: {
        200: showPublicReceiptResponseSchema,
        404: showPublicReceiptNotFoundSchema,
      },
    },
  );

export { publicReceiptRoutes };
