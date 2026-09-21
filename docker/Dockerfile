# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/cli/package.json packages/cli/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false
COPY packages packages
COPY apps apps
RUN pnpm --filter @datapot/shared build \
  && pnpm --filter @datapot/api build \
  && pnpm --filter @datapot/web build \
  && pnpm --filter @datapot/cli build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@9.15.0 --activate

ENV NODE_ENV=production \
    DPOT_WEB_PORT=8080 \
    DPOT_DATA_DIR=/data \
    DPOT_WEB_ROOT=/app/web \
    PATH="/app/node_modules/.bin:/usr/local/bin:${PATH}"

COPY --from=build /app /app
RUN ln -sf /app/packages/cli/dist/index.js /usr/local/bin/dpot \
  && chmod +x /app/packages/cli/dist/index.js \
  && mkdir -p /data

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
