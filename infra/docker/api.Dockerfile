# Multi-stage build for the Lanyard API (NestJS) in a pnpm + Turborepo monorepo.
# Build from the repo root:
#   docker build -f infra/docker/api.Dockerfile -t lanyard-api .

# ---------- deps + build ----------
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

# Manifests first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

# Sources.
COPY packages/contracts packages/contracts
COPY apps/api apps/api

# Build shared package then the API (Turbo resolves order via dependsOn ^build).
RUN pnpm --filter @lanyard/contracts build \
 && pnpm --filter @lanyard/api build

# Produce a pruned, production-only deployment of the API.
RUN pnpm --filter @lanyard/api deploy --prod /app

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
EXPOSE 4000
# Default to the HTTP API; override CMD to ["node","dist/worker.js"] for the worker.
CMD ["node", "dist/main.js"]
