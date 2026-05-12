# ── Build Stage ───────────────────────────────────────────────────────────────
FROM node:26-slim@sha256:424cafd2a035ed2b2d74acc3142b68b426fb62a47742c80a75e7117db02d6b30 AS builder

WORKDIR /app

COPY package*.json ./

# Install all deps (including devDependencies needed for TypeScript compile)
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM node:26-slim@sha256:424cafd2a035ed2b2d74acc3142b68b426fb62a47742c80a75e7117db02d6b30 AS runtime

RUN apt-get update && apt-get install -y dumb-init curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Non-root user — least-privilege execution
RUN groupadd -r nestfleet && useradd -r -g nestfleet nestfleet

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy migrations so runMigrations() can find them at runtime
COPY migrations ./migrations

# Copy provisioning assets used by cloud-init generator at runtime
COPY docker-compose.customer.yml ./docker-compose.customer.yml
COPY docker/Caddyfile.prod       ./docker/Caddyfile.prod
COPY scripts/backup.sh           ./scripts/backup.sh

RUN chown -R nestfleet:nestfleet /app
USER nestfleet

EXPOSE 3001

# dumb-init forwards SIGTERM to the Node process for graceful shutdown
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
