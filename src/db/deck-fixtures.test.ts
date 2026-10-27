//* Libraries imports
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

//* Local imports
import { deckFixtureSchema, loadDeckFixtures } from "./deck-fixtures";

const fixturesDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

describe("loadDeckFixtures", () => {
  it("parses every deck fixture in filename order", async () => {
    const decks = await loadDeckFixtures();

    expect(decks.map((deck) => deck.name)).toEqual([
      "Angelechy",
      "Radiant Typhoon",
      "Elfnote",
      "Light and Darkness Ritual - Dark Magician",
      "Blue-Eyes",
      "Invoked",
      "Power Patron",
      "Maliss — Ars Magna",
      "Sky Striker",
      "DoomZ",
      "Joey Wheeler — Red-Eyes",
      "Jaden Yuki — Elemental HERO",
      "Yusei Fudo — Stardust",
      "Yuma Tsukumo — Utopia",
      "Yuya Sakaki — Odd-Eyes",
      "Playmaker — Code Talker",
      "Ice Barrier",
      "Ghoti",
      "Subterror",
      "Magical Musket",
      "Unchained",
      "Traptrix",
      "Final Countdown",
      "Chain Burn",
      "Nurse Burn",
      "Morphing Jar",
      "Timelord",
      "Ghostrick",
      "Nouvelles",
      "Mokey Mokey",
      "Gunkan Suship",
      "Ojama",
      "Dice Jar",
      "Jackpot 7",
      "Larvae Moth",
      "Gate Guardian",
      "Huge Revolution",
      "Goblin Attack Force",
      "Ancient Rituals",
      "Weak Normal Monsters",
    ]);
  });

  it("parses passcodes with leading zeros as integers", async () => {
    const decks = await loadDeckFixtures();
    const blueEyes = decks.find((deck) => deck.name === "Blue-Eyes");
    const sage = blueEyes?.cards.find(
      (card) => card.name === "Sage with Eyes of Blue",
    );

    expect(sage).toEqual({
      name: "Sage with Eyes of Blue",
      passcode: 8240199,
      quantity: 3,
      position: 3,
    });
  });

  it("orders each deck as main, then extra, then side", async () => {
    const decks = await loadDeckFixtures();
    const fileNames = (await readdir(fixturesDirectory))
      .filter((fileName) => fileName.endsWith(".json"))
      .sort();

    expect(decks).toHaveLength(fileNames.length);

    for (const [index, fileName] of fileNames.entries()) {
      const contents = await readFile(
        path.join(fixturesDirectory, fileName),
        "utf8",
      );
      const fixture = deckFixtureSchema.parse(JSON.parse(contents));
      const deck = decks[index];
      const cards = [...fixture.main, ...fixture.extra, ...fixture.side];

      expect(deck?.name).toBe(fixture.name);
      expect(deck?.description).toBe(fixture.description);
      expect(deck?.cards).toEqual(
        cards.map((card, cardIndex) => ({
          name: card.name,
          passcode: Number(card.passcode),
          quantity: card.quantity,
          position: cardIndex + 1,
        })),
      );
    }
  });
});
