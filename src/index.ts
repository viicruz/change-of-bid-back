//* Libraries imports
import "dotenv/config";

//* Local imports
import { app } from "./app.ts";

app.listen(3001, ({ hostname, port }) => {
  console.log(`🦊 Elysia is running at http://${hostname}:${port}`);
});
