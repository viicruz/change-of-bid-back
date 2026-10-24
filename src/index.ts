//* Libraries imports
import "dotenv/config";

//* Local imports
import { app } from "./app.ts";

const port = Number(process.env.PORT ?? 3001);

app.listen({ hostname: "0.0.0.0", port }, ({ hostname, port }) => {
  console.log(`🦊 Elysia is running at http://${hostname}:${port}`);
});
