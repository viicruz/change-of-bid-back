//* Libraries imports
import { hashPassword } from "better-auth/crypto";

//* Local imports
import { db } from "./index";
import { seedLotActivity } from "./seed-lot-activity";
import { seedLots } from "./seed-lots";
import { upsertSeedUser } from "./seed-users";

const testPassword = "123123123";
const auctioneerEmail = "auctioneer@auctioneer.auctioneer";
const bidderEmail = "bidder@bidder.bidder";
const bidder2Email = "bidder2@bidder.bidder";

const seedUsers = [
  {
    name: "Bidder",
    email: bidderEmail,
    role: "BIDDER",
  },
  {
    name: "Bidder 2",
    email: bidder2Email,
    role: "BIDDER",
  },
  {
    name: "Auctioneer",
    email: auctioneerEmail,
    role: "AUCTIONEER",
  },
] as const;

async function seed() {
  const passwordHash = await hashPassword(testPassword);

  for (const seedUser of seedUsers) {
    const action = await upsertSeedUser(db, seedUser, passwordHash);

    console.log(`${action} ${seedUser.email} (${seedUser.role})`);
  }

  const now = new Date();
  const seededLots = await seedLots(auctioneerEmail, now);

  await seedLotActivity({
    auctioneerEmail,
    bidderEmails: {
      bidder: bidderEmail,
      bidder2: bidder2Email,
    },
    lots: seededLots,
    now,
  });
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
