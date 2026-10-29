#!/bin/sh
# Run from any directory after npm install. The fixture never starts a server.
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
repro_dir=$(mktemp -d)
trap 'rm -rf -- "$repro_dir"' EXIT HUP INT TERM

mkdir -p "$repro_dir/src/routes/private" "$repro_dir/src/services"
ln -s "$project_root/node_modules" "$repro_dir/node_modules"

cat > "$repro_dir/package.json" <<'JSON'
{
  "name": "fallow-t01-reproduction",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "tsx src/index.ts" },
  "dependencies": { "elysia": "1.4.30" }
}
JSON
cat > "$repro_dir/.fallowrc.json" <<'JSON'
{}
JSON
cat > "$repro_dir/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
JSON
cat > "$repro_dir/src/services/create-lot.ts" <<'TS'
export type CreatedLotItem = { id: string };
export type CreatedLot = { items: CreatedLotItem[] };
export function createLot(): CreatedLot { return { items: [] }; }
TS
cat > "$repro_dir/src/routes/private/lots.ts" <<'TS'
import { Elysia } from "elysia";
import { createLot } from "../../services/create-lot";
export const lotRoutes = new Elysia().post("/lots", ({ status }) => status(201, createLot()));
TS
cat > "$repro_dir/src/routes/private/index.ts" <<'TS'
import { Elysia } from "elysia";
import { lotRoutes } from "./lots";
const privateRoutes = new Elysia({ prefix: "/private" }).use(lotRoutes);
export { privateRoutes };
TS
cat > "$repro_dir/src/index.ts" <<'TS'
import { Elysia } from "elysia";
import { privateRoutes } from "./routes/private";
new Elysia().use(privateRoutes);
TS

"$project_root/node_modules/.bin/tsc" --project "$repro_dir/tsconfig.json"
"$project_root/node_modules/.bin/fallow" dead-code --root "$repro_dir" \
  --type-aware --format json --quiet --explain
