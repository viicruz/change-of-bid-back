#!/bin/sh
set -eu

# Resets, migrates and seeds the database once per deploy key. Render sets
# RENDER_GIT_COMMIT; without a key (e.g. Docker Compose) this step is skipped.
if [ -n "${DEPLOY_RESET_KEY:-${RENDER_GIT_COMMIT:-}}" ]; then
  node_modules/.bin/tsx src/db/deploy-reset.ts
fi

exec node dist/index.js
