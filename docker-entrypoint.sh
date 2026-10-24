#!/bin/sh
set -eu

npx drizzle-kit migrate
exec node --experimental-strip-types src/index.ts
