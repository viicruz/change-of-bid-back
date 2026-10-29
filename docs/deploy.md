# Deployment and database operations

The Docker image runs with `NODE_ENV=production`. Its entrypoint starts the
compiled server with `exec node dist/index.js`. Without a deploy reset key,
starting or restarting the container does not reset the database, run
migrations, or create demo data. See [Reset once per deploy](#reset-once-per-deploy).

## Reset once per deploy

When `DEPLOY_RESET_KEY` or `RENDER_GIT_COMMIT` is set, the entrypoint runs
`src/db/deploy-reset.ts` before starting the server. Render sets
`RENDER_GIT_COMMIT` to the deployed commit, so every Render deploy of a new commit:

1. drops the `public` and `drizzle` schemas and recreates `public`;
2. applies the migrations with `drizzle-kit migrate`;
3. runs the demo seed (`src/db/seed.ts`).

**All data in the database is lost on each such deploy.** The completed key is
stored in `deploy_state.reset_run`, which the reset does not drop, so restarts of
the same deploy skip the reset. If any step fails, the container exits before the
server starts, the key is not recorded, and the next boot tries again.

- Redeploying the same commit does not reset. Set `DEPLOY_RESET_KEY` to a new
  value to force a reset.
- Docker Compose sets neither variable, so local containers never reset.
- The seed downloads card data and images from YGOProDeck. A temporary API
  failure fails the boot; redeploying usually fixes it.

## Deploying with Docker

Build the image, then run migrations once as a separate deployment step before
starting the application. Use the same image and `DATABASE_URL` for both steps.
The image includes Drizzle Kit, its configuration, and the migration files.

```sh
docker build -t change-of-bid-back .
docker run --rm --env-file .env --entrypoint npm change-of-bid-back run db:migrate
```

Continue only if the migration command succeeds. Start the server with the
application environment and port mapping required by your deployment, for example:

```sh
docker run --rm --env-file .env -e PORT=10000 -p 10000:10000 change-of-bid-back
```

Subsequent restarts only start the server. In local development, apply migrations
explicitly with `npm run db:migrate` before starting the app.

## Resetting a development database

`npm run db:fresh` drops and recreates the database selected by `DATABASE_URL`,
then applies migrations. It refuses to run when `NODE_ENV=production`, before
connecting to PostgreSQL or launching migrations. It also rejects invalid names
and the reserved databases `postgres`, `template0`, and `template1`.

For a disposable development database, run the reset and demo seed explicitly:

```sh
NODE_ENV=development npm run db:fresh
npm run db:seed
```

Check that `DATABASE_URL` points to the intended disposable database first. The
environment check does not identify whether a remote database contains production
data. Demo accounts and activity are described in [Seed](seed.md).
