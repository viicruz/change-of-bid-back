//* Libraries imports
import { cron, Patterns } from "@elysiajs/cron";

//* Local imports
import { app } from "./app";

//* Services imports
import {
  describeSettlementFailure,
  settleDueLots,
} from "./services/lots/settle-due-lots";

async function runLotSettlement() {
  try {
    await settleDueLots();
  } catch (error) {
    console.error(describeSettlementFailure(error), error);
  }
}

export async function startApplication() {
  const port = Number(process.env.PORT ?? 3001);

  app.use(
    cron({
      name: "settleDueLots",
      pattern: Patterns.EVERY_10_SECONDS,
      async run() {
        await runLotSettlement();
      },
    }),
  );

  await runLotSettlement();

  app.listen({ hostname: "0.0.0.0", port }, ({ hostname, port }) => {
    console.log(`🦊 Elysia is running at http://${hostname}:${port}`);
  });
}
