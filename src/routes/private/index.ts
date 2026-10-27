//* Libraries imports
import { Elysia } from "elysia";

//* Local imports
import { betterAuthMacro, auth } from "../../lib/auth";

//* Routes imports
import { lotRoutes } from "./lots";
import { userRoutes } from "./user";
import { walletRoutes } from "./wallet";

const privateRoutes = new Elysia({ prefix: "/private" })
  .use(betterAuthMacro)
  .use(userRoutes)
  .use(lotRoutes)
  .use(walletRoutes);

export { privateRoutes };