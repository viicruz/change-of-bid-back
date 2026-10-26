//* Libraries imports
import { Elysia } from "elysia";

//* Local imports
import { betterAuthMacro, auth } from "../../lib/auth";

//* Routes imports
import { userRoutes } from "./user";

const privateRoutes = new Elysia({ prefix: "/private" })
  .use(betterAuthMacro)
  .use(userRoutes);

export { privateRoutes };