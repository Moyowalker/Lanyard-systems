# Build from the repository root with APP set to web-store, web-admin, or web-marketing.
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo

ARG APP
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_STORE_URL
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
ARG NEXT_PUBLIC_SUPPORT_PHONE_E164
ARG NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP_URL
ARG NEXT_PUBLIC_SUPPORT_HOURS

ENV NEXT_STANDALONE=true \
    LANYARD_REQUIRE_EXPLICIT_CONFIG=true \
    API_HOSTPORT=api:4000 \
    API_GLOBAL_PREFIX=api/v1 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_STORE_URL=$NEXT_PUBLIC_STORE_URL \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_SUPPORT_PHONE_E164=$NEXT_PUBLIC_SUPPORT_PHONE_E164 \
    NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY=$NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY \
    NEXT_PUBLIC_SUPPORT_WHATSAPP_URL=$NEXT_PUBLIC_SUPPORT_WHATSAPP_URL \
    NEXT_PUBLIC_SUPPORT_HOURS=$NEXT_PUBLIC_SUPPORT_HOURS

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/${APP}/package.json apps/${APP}/package.json
RUN pnpm install --frozen-lockfile

COPY packages/contracts packages/contracts
COPY apps/${APP} apps/${APP}
RUN test "$APP" = "web-store" -o "$APP" = "web-admin" -o "$APP" = "web-marketing" \
 && pnpm --filter @lanyard/contracts build \
 && pnpm --filter @lanyard/${APP} build

FROM node:20-alpine AS runtime
WORKDIR /app
ARG APP
ENV NODE_ENV=production \
    LANYARD_REQUIRE_EXPLICIT_CONFIG=true \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    APP_NAME=$APP
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/${APP_NAME}/server.js"]
