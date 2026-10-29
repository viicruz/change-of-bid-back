#!/bin/sh
# Always measure current code against a new, disposable PostgreSQL database.
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$project_root"
report_dir=$(mktemp -d "${TMPDIR:-/tmp}/change-of-bid-fallow-coverage.XXXXXX")
printf 'Relatórios desta execução: %s\n' "$report_dir"

container_id=
cleanup() {
  if [ -n "$container_id" ]; then
    docker stop "$container_id" >/dev/null
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

container_id=$(docker run --detach --rm \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=fallow_test --env POSTGRES_PASSWORD=fallow_test \
  --env POSTGRES_DB=change_of_bid_fallow_test \
  --tmpfs /var/lib/postgresql/data postgres:17)
database_port=$(docker port "$container_id" 5432/tcp)
database_port=${database_port##*:}
export DATABASE_URL="postgresql://fallow_test:fallow_test@127.0.0.1:$database_port/change_of_bid_fallow_test"
export BETTER_AUTH_SECRET=fallow-test-auth-secret-with-at-least-32-characters
export BID_HASH_SECRET=fallow-test-bid-hash-secret-at-least-32-characters
export BETTER_AUTH_URL=http://localhost:3000
export PAGE_ORIGIN=http://localhost:5173
export NODE_ENV=test

attempt=0
until docker exec "$container_id" pg_isready -U fallow_test -d change_of_bid_fallow_test; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 1
done

npm run db:migrate
# Suites share this database; settlement scans can see another suite's fixtures.
npm run test:coverage -- --no-file-parallelism --coverage.reportsDirectory="$report_dir/coverage"
coverage_file="$report_dir/coverage/coverage-final.json"
[ -s "$coverage_file" ]

# Keep both real exit codes: the full inventory includes estimated test helpers.
production_status=0
node_modules/.bin/fallow health --production --complexity \
  --coverage "$coverage_file" --format json --quiet --explain \
  > "$report_dir/health-production.json" || production_status=$?
inventory_status=0
node_modules/.bin/fallow health --complexity --complexity-breakdown \
  --hotspots --ownership --targets --coverage-gaps --file-scores --score \
  --coverage "$coverage_file" --format json --quiet --explain \
  > "$report_dir/health-inventory.json" || inventory_status=$?

printf 'health-production=%s\nhealth-inventory=%s\n' \
  "$production_status" "$inventory_status" > "$report_dir/status.txt"
cat "$report_dir/status.txt"
printf 'Relatórios preservados em: %s\n' "$report_dir"

# Production is the gate. Inventory findings (1) remain visible for review;
# setup/validation/tool failures (>1) must still fail the command.
[ "$production_status" -eq 0 ] || exit "$production_status"
case "$inventory_status" in
  0|1) exit 0 ;;
  *) exit "$inventory_status" ;;
esac
