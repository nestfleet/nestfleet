# ── Build Stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:4d64b49e6c891c8fc821007cb1cdc6c0db7773110ac2c34bf2e6960adef62ed3 AS builder

# NEXT_PUBLIC_API_URL is baked in at build time.
# In production this is set via --build-arg (or docker-compose build arg).
# Leave empty to use same-origin routing through Caddy (recommended).
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ARG NEXT_PUBLIC_PRODUCT_ID=""
ENV NEXT_PUBLIC_PRODUCT_ID=${NEXT_PUBLIC_PRODUCT_ID}

# Set to "true" to show the marketing landing page at /.
# nestfleet.dev CI passes NEXT_PUBLIC_SHOW_LANDING=true via --build-arg.
# Customer VPS builds omit it (app-only, landing not needed).
ARG NEXT_PUBLIC_SHOW_LANDING=""
ENV NEXT_PUBLIC_SHOW_LANDING=${NEXT_PUBLIC_SHOW_LANDING}

WORKDIR /app

# node-gyp deps (needed by some native npm packages)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:4d64b49e6c891c8fc821007cb1cdc6c0db7773110ac2c34bf2e6960adef62ed3 AS runtime

WORKDIR /app

RUN addgroup -S nestfleet && adduser -S nestfleet -G nestfleet

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

RUN chown -R nestfleet:nestfleet /app
USER nestfleet

EXPOSE 3002

CMD ["node_modules/.bin/next", "start", "--port", "3002"]
