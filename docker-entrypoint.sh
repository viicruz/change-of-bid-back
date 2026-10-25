#!/bin/sh
set -eu

npx drizzle-kit migrate
exec node dist/index.js
