#!/bin/sh
set -eu

# npx drizzle-kit migrate

# temporary reset database
npm run db:fresh
npm run db:seed

exec node dist/index.js
