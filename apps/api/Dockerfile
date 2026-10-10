# Production image for the API and its cron jobs (#65). Build context is the
# repo root. Installs only the API's production dependencies, so the Expo app,
# the root agent tooling and test tooling never enter the image.
FROM node:24-trixie-slim AS deps

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# Isolated linker: the repo's hoisted layout exists for Metro and would pull
# the whole workspace into one tree.
RUN pnpm install --frozen-lockfile --prod --filter @kavtsya/api... \
    --ignore-scripts --config.node-linker=isolated

FROM node:24-trixie-slim

# Package managers aren't needed at runtime; dropping them shrinks the attack
# surface the scanners report on.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

WORKDIR /app
COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
USER node
WORKDIR /app/apps/api
# Node runs as PID 1 (no pnpm wrapper) so Railway's SIGTERM reaches it.
CMD ["node", "--import", "tsx", "src/index.ts"]
