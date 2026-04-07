# ── Build Stage ───────────────────────────────────────────────────────────────
FROM node:22-slim@sha256:80fdb3f57c815e1b638d221f30a826823467c4a56c8f6a8d7aa091cd9b1675ea AS builder

WORKDIR /app

COPY package*.json ./

# Install all deps (including devDependencies needed for TypeScript compile)
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM node:22-slim@sha256:80fdb3f57c815e1b638d221f30a826823467c4a56c8f6a8d7aa091cd9b1675ea AS runtime

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
