#!/usr/bin/env bash
# NestFleet — PostgreSQL backup script (NF-PIVOT-09)
#
# Usage:
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/backup.sh
#
# Options (env vars):
#   BACKUP_DIR    — directory for backup files (default: ./backups)
#   BACKUP_KEEP   — number of backups to retain (default: 7)
#
# S3 upload (optional — local-only mode if unset):
#   BACKUP_S3_ENDPOINT   — Hetzner Object Storage endpoint, e.g. https://nbg1.your-objectstorage.com
#   BACKUP_S3_ACCESS_KEY — S3 access key ID
#   BACKUP_S3_SECRET_KEY — S3 secret access key
#   BACKUP_S3_BUCKET     — S3 bucket name (default: nestfleet-backups)
#   CUSTOMER_SLUG        — path prefix inside the bucket (default: default)
#
# Requires: postgresql-client, aws-cli (only for S3 upload)
#
# Typically run via cron:
#   0 3 * * * cd /opt/nestfleet && DATABASE_URL="..." ./scripts/backup.sh >> /var/log/nestfleet-backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="nestfleet_${TIMESTAMP}.pgdump"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting backup → ${BACKUP_DIR}/${FILENAME}"

pg_dump \
  --format=custom \
  --compress=9 \
  --no-password \
  "$DATABASE_URL" \
  --file="${BACKUP_DIR}/${FILENAME}"

SIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup complete: ${FILENAME} (${SIZE})"

# ── S3 upload (optional) ──────────────────────────────────────────────────────
# Requires aws-cli and BACKUP_S3_ENDPOINT to be set.
# Local backup is always retained regardless of S3 outcome.
if [[ -n "${BACKUP_S3_ENDPOINT:-}" ]]; then
  S3_PATH="s3://${BACKUP_S3_BUCKET:-nestfleet-backups}/${CUSTOMER_SLUG:-default}/${FILENAME}"
  AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY}" \
  AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY}" \
  aws s3 cp "${BACKUP_DIR}/${FILENAME}" "$S3_PATH" \
    --endpoint-url "$BACKUP_S3_ENDPOINT" \
    --no-progress
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Uploaded to S3: ${S3_PATH}"
fi

# Rotate — keep only the N most recent backups
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/nestfleet_*.pgdump 2>/dev/null | wc -l)
if [[ "$BACKUP_COUNT" -gt "$BACKUP_KEEP" ]]; then
  DELETE_COUNT=$(( BACKUP_COUNT - BACKUP_KEEP ))
  ls -1t "${BACKUP_DIR}"/nestfleet_*.pgdump | tail -n "$DELETE_COUNT" | while read -r OLD; do
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Removing old backup: ${OLD}"
    rm -f "$OLD"
  done
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Done. Backups retained: $(ls -1 "${BACKUP_DIR}"/nestfleet_*.pgdump 2>/dev/null | wc -l)/${BACKUP_KEEP}"
