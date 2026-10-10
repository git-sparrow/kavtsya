# Production image for the API and its cron jobs (#65). Build context is the
# repo root. Installs only the API's workspace slice, so the Expo app and the
# root agent tooling (native builds) never enter the image.
FROM node:24-slim

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# Isolated linker: the repo's hoisted layout exists for Metro and would pull
# the whole workspace into one tree.
RUN pnpm install --frozen-lockfile --filter @kavtsya/api... --ignore-scripts \
    --config.node-linker=isolated

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
WORKDIR /app/apps/api
# Node runs as PID 1 (no pnpm wrapper) so Railway's SIGTERM reaches it.
CMD ["node", "--import", "tsx", "src/index.ts"]
