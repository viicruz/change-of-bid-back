FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev \
  && npm install --no-save --include=dev drizzle-kit@1.0.0-rc.5

COPY . .

RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production

EXPOSE 10000

ENTRYPOINT ["./docker-entrypoint.sh"]