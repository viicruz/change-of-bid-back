# Deployment and database operations

The Docker image runs with `NODE_ENV=production`. Its entrypoint starts the
compiled server with `exec node dist/index.js`. Starting or restarting the
container does not reset the database, run migrations, or create demo data.

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
