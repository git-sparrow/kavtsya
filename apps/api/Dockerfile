# Production image for the API and its cron jobs (#65). Build context is the
# repo root; the runtime stage gets the bundles from scripts/build.ts and the
# SQL migrations, nothing else.
FROM node:24-trixie-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# Isolated linker: the repo's hoisted layout exists for Metro and would pull
# the whole workspace into one tree.
RUN pnpm install --frozen-lockfile --filter @kavtsya/api... \
    --ignore-scripts --config.node-linker=isolated

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @kavtsya/api build

FROM node:24-trixie-slim

# Debian security fixes reach the archive before the base image is
# republished, so apply them at build time.
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Package managers aren't needed at runtime; dropping them shrinks the attack
# surface the scanners report on.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
# No setuid/setgid binaries (su, mount, passwd…): the process never needs root,
# so a code-execution bug can't climb through one.
RUN find / -xdev -perm /6000 -type f -exec chmod a-s {} +

WORKDIR /app
COPY --from=build /app/apps/api/dist dist
COPY apps/api/migrations migrations

ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
USER node
# Node runs as PID 1 (no pnpm wrapper) so Railway's SIGTERM reaches it. The
# pre-deploy step and cron services run the other bundles in dist/.
CMD ["node", "dist/index.mjs"]
