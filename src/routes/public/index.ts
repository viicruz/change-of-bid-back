//* Libraries imports
import { Elysia } from "elysia";

//* Routes imports
import { publicLotRoutes } from "./lots";
import { publicReceiptRoutes } from "./receipts";
import { yugiohCardsRoutes } from "./yugioh-cards";

const publicRoutes = new Elysia({ prefix: "/public" })
    .get("/", () => "Hello World")
    .use(yugiohCardsRoutes)
    .use(publicLotRoutes)
    .use(publicReceiptRoutes);

export { publicRoutes };