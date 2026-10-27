//* Libraries imports
import { Elysia } from "elysia";

//* Local imports
import { betterAuthMacro } from "../../lib/auth";

const userRoutes = new Elysia({ prefix: "/user" })
    .use(betterAuthMacro)
    .get("/", ({ user }) => user, {
        auth: true,
    })

export { userRoutes };