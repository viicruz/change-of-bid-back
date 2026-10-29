//* Libraries imports
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const deckCardSchema = z.object({
  name: z.string().trim().min(1),
  passcode: z.string().regex(/^\d{8}$/),
  quantity: z.number().int().positive(),
});

export const deckFixtureSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  main: z.array(deckCardSchema).min(1),
  extra: z.array(deckCardSchema),
  side: z.array(deckCardSchema),
});

type DeckFixture = z.infer<typeof deckFixtureSchema>;

export type DeckLotCard = {
  name: string;
  passcode: number;
  quantity: number;
  position: number;
};

export type DeckLot = {
  name: string;
  description: string;
  cards: DeckLotCard[];
};

const defaultFixturesDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

export async function loadDeckFixtures(
  directory = defaultFixturesDirectory,
): Promise<DeckLot[]> {
  const fileNames = (await readdir(directory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
  const decks: DeckLot[] = [];

  for (const fileName of fileNames) {
    const contents = await readFile(path.join(directory, fileName), "utf8");
    const fixture = deckFixtureSchema.parse(JSON.parse(contents));

    decks.push(toDeckLot(fixture));
  }

  return decks;
}

function toDeckLot(fixture: DeckFixture): DeckLot {
  const sections = [...fixture.main, ...fixture.extra, ...fixture.side];

  return {
    name: fixture.name,
    description: fixture.description,
    cards: sections.map((card, index) => ({
      name: card.name,
      passcode: parsePasscode(card.passcode),
      quantity: card.quantity,
      position: index + 1,
    })),
  };
}

function parsePasscode(passcode: string): number {
  const cardId = Number(passcode);

  if (!Number.isSafeInteger(cardId) || cardId <= 0) {
    throw new Error(`Passcode ${passcode} is not a valid card id`);
  }

  return cardId;
}
