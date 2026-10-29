FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev \
  && npm install --no-save drizzle-kit@1.0.0-rc.5 tsx@4.23.15 \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
# COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts
# COPY --from=build /app/src/db/migrations ./src/db/migrations
# COPY --from=build /app/src/db/seed.ts ./src/db/seed.ts
# COPY --from=build /app/src/db/fresh.ts ./src/db/fresh.ts
# COPY --from=build /app/src/db ./src/db
COPY --from=build /app/src ./src
COPY docker-entrypoint.sh ./

RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 10000

ENTRYPOINT ["./docker-entrypoint.sh"]
