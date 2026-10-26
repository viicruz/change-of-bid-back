//* Libraries imports
import { Elysia } from "elysia";

//* Routes imports

const publicRoutes = new Elysia({ prefix: "/public" })
    .get("/", () => "Hello World");

export { publicRoutes };