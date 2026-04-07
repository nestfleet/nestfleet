/**
 * cloud-init YAML generator — FEAT-001.
 *
 * Generates the user_data payload for Hetzner VPS creation.
 * Uses write_files to embed the complete .env, docker-compose, Caddyfile,
 * and backup.sh directly — no git clone, no deploy keys, no sed fragility.
 *
 * File contents are read from disk once and cached in module scope.
 * No per-provisioning disk I/O after first call.
 */

import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, "../../")

// ── File content cache (loaded once at first use) ─────────────────────────────

let _dockerCompose: string | null = null
let _caddyfile:     string | null = null
let _backupSh:      string | null = null

async function loadFiles(): Promise<{ dockerCompose: string; caddyfile: string; backupSh: string }> {
  if (_dockerCompose && _caddyfile && _backupSh) {
    return { dockerCompose: _dockerCompose, caddyfile: _caddyfile, backupSh: _backupSh }
  }

  const [dockerCompose, caddyfile, backupSh] = await Promise.all([
    readFile(join(REPO_ROOT, "docker-compose.customer.yml"), "utf-8"),
    readFile(join(REPO_ROOT, "docker/Caddyfile.prod"), "utf-8"),
    readFile(join(REPO_ROOT, "scripts/backup.sh"), "utf-8"),
  ])

  _dockerCompose = dockerCompose
  _caddyfile     = caddyfile
  _backupSh      = backupSh

  return { dockerCompose, caddyfile, backupSh }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CloudInitOpts {
  slug:                   string
  baseDomain:             string
  postgresPassword:       string
  jwtSecret:              string
  encryptionKey:          string
  bundledLlmApiKey:       string
  bundledEmbeddingApiKey: string
  opsPublicKey:           string
  ghcrToken?:             string   // GHCR PAT for pulling images (omit if packages are public)
  backupS3Endpoint?:      string
  backupS3AccessKey?:     string
  backupS3SecretKey?:     string
  backupS3Bucket?:        string
}

/**
 * Generate the cloud-init YAML user_data string for a customer VPS.
 * Reads docker-compose.prod.yml, Caddyfile.prod, and backup.sh from disk
 * (cached after first call) and embeds them verbatim.
 */
export async function generateCloudInit(opts: CloudInitOpts): Promise<string> {
  const { dockerCompose, caddyfile, backupSh } = await loadFiles()

  const {
    slug,
    baseDomain,
    postgresPassword,
    jwtSecret,
    encryptionKey,
    bundledLlmApiKey,
    bundledEmbeddingApiKey,
    opsPublicKey,
    ghcrToken,
  } = opts

  const backupS3Endpoint   = opts.backupS3Endpoint   ?? ""
  const backupS3AccessKey  = opts.backupS3AccessKey  ?? ""
  const backupS3SecretKey  = opts.backupS3SecretKey  ?? ""
  const backupS3Bucket     = opts.backupS3Bucket     ?? "nestfleet-backups"

  // Indent file content for YAML block scalar (add 6 spaces to each line)
  const indent = (content: string, spaces = 6): string =>
    content
      .split("\n")
      .map((line) => (line ? " ".repeat(spaces) + line : ""))
      .join("\n")

  return `#cloud-config
package_update: true
packages:
  - docker.io
  - docker-compose-plugin
  - curl

write_files:
  - path: /opt/nestfleet/.env
    permissions: '0600'
    content: |
      NODE_ENV=production
      PORT=3001
      NESTFLEET_DOMAIN=${slug}.${baseDomain}
      DATABASE_URL=postgres://nestfleet:${postgresPassword}@postgres:5432/nestfleet
      POSTGRES_PASSWORD=${postgresPassword}
      JWT_SECRET=${jwtSecret}
      ENCRYPTION_KEY=${encryptionKey}
      REGISTRATION_ENABLED=true
      BILLING_ENABLED=false
      LLM_PROVIDER=google
      LLM_API_KEY=${bundledLlmApiKey}
      LLM_MODEL=gemini-2.5-flash-lite
      LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
      EMBEDDING_PROVIDER=openai
      EMBEDDING_API_KEY=${bundledEmbeddingApiKey}
      EMBEDDING_MODEL=gemini-embedding-001
      EMBEDDING_DIMENSIONS=768
      EMBEDDING_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
      CONSOLE_ORIGIN=https://${slug}.${baseDomain}
      LOG_LEVEL=info
      BACKUP_S3_ENDPOINT=${backupS3Endpoint}
      BACKUP_S3_ACCESS_KEY=${backupS3AccessKey}
      BACKUP_S3_SECRET_KEY=${backupS3SecretKey}
      BACKUP_S3_BUCKET=${backupS3Bucket}
      CUSTOMER_SLUG=${slug}

  - path: /opt/nestfleet/docker-compose.prod.yml
    content: |
${indent(dockerCompose)}

  - path: /opt/nestfleet/docker/Caddyfile.prod
    content: |
${indent(caddyfile)}

  - path: /opt/nestfleet/scripts/backup.sh
    permissions: '0755'
    content: |
${indent(backupSh)}

ssh_authorized_keys:
  - ${opsPublicKey}

runcmd:
  - mkdir -p /opt/nestfleet/docker /opt/nestfleet/scripts /opt/nestfleet/backups
  - cd /opt/nestfleet${ghcrToken ? `\n  - echo "${ghcrToken}" | docker login ghcr.io -u nestfleet --password-stdin` : ""}
  - docker compose -f docker-compose.prod.yml pull
  - docker compose -f docker-compose.prod.yml up -d
  - echo "0 2 * * * root DATABASE_URL=\$(grep DATABASE_URL /opt/nestfleet/.env | cut -d= -f2-) /opt/nestfleet/scripts/backup.sh >> /var/log/nestfleet-backup.log 2>&1" > /etc/cron.d/nestfleet-backup
  - chmod 0644 /etc/cron.d/nestfleet-backup
`
}

/** Flush the file content cache (used in tests). */
export function _resetCloudInitCache(): void {
  _dockerCompose = null
  _caddyfile     = null
  _backupSh      = null
}
