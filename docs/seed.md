# Seed

`npm run db:seed` fills a development database with users, lots, deposits, and bids. The entry point is [`src/db/seed.ts`](../src/db/seed.ts). It needs `DATABASE_URL` and `BID_HASH_SECRET`.

The run has three steps, all using the same `now`:

1. Upsert the seed users and their wallets.
2. Create lots from the deck fixtures ([`src/db/seed-lots.ts`](../src/db/seed-lots.ts)).
3. Deposit, bid, settle, and cancel ([`src/db/seed-lot-activity.ts`](../src/db/seed-lot-activity.ts)).

What each lot should look like is decided up front by [`src/db/seed-lot-plan.ts`](../src/db/seed-lot-plan.ts). That plan is fixed. A second run with the same fixtures produces the same distribution relative to the new `now`.

## Users

Every account uses the password `123123123`. Email is already verified.

| Name | Email | Role |
| --- | --- | --- |
| Bidder | `bidder@bidder.bidder` | `BIDDER` |
| Bidder 2 | `bidder2@bidder.bidder` | `BIDDER` |
| Auctioneer | `auctioneer@auctioneer.auctioneer` | `AUCTIONEER` |

An existing user with the same email is updated in place: name, role, verified flag, and credential password. A wallet is created when the user does not have one. The auctioneer owns every seeded lot. Only the two bidders deposit and bid.

## Decks

Lots come from the JSON files directly under [`src/db/fixtures/`](../src/db/fixtures/). [`loadDeckFixtures`](../src/db/deck-fixtures.ts) reads those files in filename order (`01` through `40`) and ignores the nested `30_decks_yugioh_JSON` copies. The seed expects exactly 40 decks.

Each file has a name, a description, and `main`, `extra`, and `side` cards. Cards become lot items in that section order. Quantity is kept from the fixture. Passcodes are the catalog card ids.

Missing cards are fetched from YGOProDeck and stored before the lots are inserted. A card without an image stops the seed.

## How a lot is classified

The database stores `ACTIVE`, `ENDED`, or `CANCELED`. The lists the API shows are computed from that status plus the schedule:

| Seed group | Files | Stored status | What the API shows |
| --- | --- | --- | --- |
| Scheduled | `01`–`10` | `ACTIVE`, start in the future | `SCHEDULED` |
| Live | `11`–`20` | `ACTIVE`, window open | `LIVE` |
| Ended | `21`–`30` | `ENDED` after settlement | `ENDED` |
| Canceled | `31`–`40` | `CANCELED` | `CANCELED` |

`openingBid` ramps from `25.00` on the first deck to `100.00` on the last. `minIncrement` is `5.00` on every lot.

Schedules, measured from `now`:

- **Scheduled.** Starts in 1 to 10 days and lasts 3 days. No bids.
- **Live.** Started yesterday and ends in 2 to 11 days.
- **Ended.** Inserted on an open window so bids can be accepted, then moved to a closed window: started 12 to 21 days ago and ended 1 to 10 days ago.
- **Canceled.** Same open window as a live lot. Cancellation happens while the end is still in the future.

A lot whose title already exists for this auctioneer is skipped. Bids, settlement, and cancellation run only for lots created in the current execution.

## Deposits

Each bidder receives five deposits when that wallet has no `DEPOSIT` movement yet:

`100.00`, `250.00`, `500.00`, `1000.00`, `2500.00`.

The total is `4350.00`, enough to cover every lot that bidder is leading at the same time. A leading bid reserves the full amount, not only the increment.

Deposits go through the `deposit` service, then their `createdAt` is moved to 40, 36, 32, 28, and 24 days before `now`. That places them before the earliest ended lot. A later run does not add deposits again.

## Bids, wins, and losses

Bids go through `placeBid`. The first bid on a lot is the opening bid. Each later bid adds `5.00`. The two bidders alternate, so the current leader never bids against themselves. Bids are placed while the lot window is still days away from its end, so the two-minute anti-snipe extension does not run. If a bid does extend the lot, the seed stops.

The bid list is fixed per position inside each group of ten:

- **Live.** Three lots have no bids. The rest have one, two, or three bids. Whoever is last is the current leader and keeps the hold.
- **Ended.** Eight lots are contested. Each bidder wins four and loses four. Two lots have no bids and settle with no winner. The last bidder in the list is the winner.
- **Canceled.** Five lots receive bids and are then canceled, which releases the leader's hold and keeps the bid rows. Five are canceled with no bids.

After the bids are accepted, their timestamps are moved into the lot's final window and spread evenly inside it. Live and canceled bids stay between yesterday and `now`. Ended bids fall inside the closed window. The bid hash includes `createdAt`, so the seed recomputes `previousHash`, `hash`, and the lot `headHash` with `BID_HASH_SECRET`. The matching `HOLD` moves to that bid's time. A `RELEASE` from being outbid moves to the time of the next bid.

## Settlement and cancellation

Ended lots are updated to the closed window, then passed to `settleDueLots`. The call only returns those lot ids, so another overdue lot already in the database is left alone.

Settlement debits the winner, credits the auctioneer, writes the receipt, and sets `ENDED`, `endedAt`, and `settledAt`. Lots with no bids end with no winner. Settlement rows stay at the seed's `now`, which is when the job would have run.

Canceled lots are passed to `cancelLot` as the auctioneer. The release created by cancellation stays at `now`.

## Running it again

Users and passwords are refreshed. Existing lot titles are left as they are, including lots created by an older seed that were all live. Deposits are skipped once any deposit exists. To apply this distribution on a database that already has those titles, remove the auctioneer's seeded lots or reset the database, then run `npm run db:seed` again.

The plan itself is covered by [`src/db/seed-lot-plan.test.ts`](../src/db/seed-lot-plan.test.ts) without a database or the card API.
