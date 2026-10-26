//* Libraries imports
import { Elysia } from "elysia";

//* Routes imports
import { yugiohCardsRoutes } from "./yugioh-cards";

const publicRoutes = new Elysia({ prefix: "/public" })
    .get("/", () => "Hello World")
    .use(yugiohCardsRoutes);

export { publicRoutes };