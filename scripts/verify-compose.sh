#!/usr/bin/env bash
# NestFleet — docker-compose.prod.yml smoke test (NF-OPS-04)
#
# Spins up the production compose stack locally with minimal generated secrets,
# waits up to 90s for the API health check, then tears everything down.
#
# Usage:
#   ./scripts/verify-compose.sh
#
# Prerequisites:
#   - Docker with Compose plugin installed and running
#   - curl
#   - openssl (for secret generation)
#
# The script always runs `docker compose down -v` on exit (pass or fail).
# chmod +x scripts/verify-compose.sh

set -euo pipefail

ENV_FILE=".env.verify"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://localhost:3001/health"
HEALTH_TIMEOUT=90
API_PORT=3001

cleanup() {
  echo "[verify] Tearing down..."
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v --remove-orphans 2>/dev/null || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

# ── Generate minimal .env.verify ──────────────────────────────────────────────

POSTGRES_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

cat > "$ENV_FILE" <<EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
NESTFLEET_DOMAIN=verify.localhost
LOG_LEVEL=info
LLM_PROVIDER=google
LLM_API_KEY=test-key
LLM_MODEL=gemini-2.5-flash-lite
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=test-key
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
BILLING_ENABLED=false
REGISTRATION_ENABLED=true
EOF

echo "[verify] Generated ${ENV_FILE}"

# ── Expose API port for health polling (override network binding) ─────────────
# We add a ports override via --compose-file override inline approach.
# Instead we use a temporary override file so we can reach port 3001 from host.

OVERRIDE_FILE=".docker-compose.verify-override.yml"
cat > "$OVERRIDE_FILE" <<EOF
services:
  api:
    ports:
      - "${API_PORT}:3001"
EOF

cleanup_override() {
  rm -f "$OVERRIDE_FILE"
  cleanup
}
trap cleanup_override EXIT

# ── Start stack ───────────────────────────────────────────────────────────────

echo "[verify] Starting stack (console + caddy skipped via profiles not set — api + postgres only check)..."
docker compose \
  -f "$COMPOSE_FILE" \
  -f "$OVERRIDE_FILE" \
  --env-file "$ENV_FILE" \
  up -d postgres api

# ── Wait for health ───────────────────────────────────────────────────────────

echo "[verify] Waiting up to ${HEALTH_TIMEOUT}s for ${HEALTH_URL}..."

ELAPSED=0
INTERVAL=5
PASSED=false

while [[ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]]; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    PASSED=true
    break
  fi
  echo "[verify] ${ELAPSED}s — waiting (last HTTP ${HTTP_CODE})..."
  sleep "$INTERVAL"
  ELAPSED=$(( ELAPSED + INTERVAL ))
done

# ── Result ────────────────────────────────────────────────────────────────────

if [[ "$PASSED" == "true" ]]; then
  echo ""
  echo "[verify] PASS — API health check returned 200 after ${ELAPSED}s"
  exit 0
else
  echo ""
  echo "[verify] FAIL — API did not respond within ${HEALTH_TIMEOUT}s"
  echo "[verify] Container logs (api):"
  docker compose -f "$COMPOSE_FILE" -f "$OVERRIDE_FILE" --env-file "$ENV_FILE" logs --tail=50 api || true
  exit 1
fi
