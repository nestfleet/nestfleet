/**
 * Unit tests: cloud-init generator — FEAT-001.
 *
 * NF-UNIT-CLINIT-01  generated YAML starts with cloud-config header
 * NF-UNIT-CLINIT-02  slug is substituted into NESTFLEET_DOMAIN
 * NF-UNIT-CLINIT-03  postgresPassword is present in output (in DATABASE_URL + POSTGRES_PASSWORD)
 * NF-UNIT-CLINIT-04  jwtSecret is present in JWT_SECRET line
 * NF-UNIT-CLINIT-05  encryptionKey is present in ENCRYPTION_KEY line
 * NF-UNIT-CLINIT-06  BILLING_ENABLED=false is set (customer VPSes must not have billing active)
 * NF-UNIT-CLINIT-07  REGISTRATION_ENABLED=true is set (customer creates first account)
 * NF-UNIT-CLINIT-08  ssh_authorized_keys contains the ops public key
 * NF-UNIT-CLINIT-09  runcmd includes docker compose up
 * NF-UNIT-CLINIT-10  no other customer's secrets leak into the output (different opts → different output)
 * NF-UNIT-CLINIT-11  LLM_PROVIDER=google and LLM_MODEL=gemini-2.5-flash-lite are injected
 * NF-UNIT-CLINIT-12  S3 vars appear in .env when opts include them
 * NF-UNIT-CLINIT-13  S3 vars are empty strings (not "undefined") when opts omit them
 * NF-UNIT-CLINIT-14  LICENSE_FILE_PATH env var is set to /opt/nestfleet/license.jwt
 * NF-UNIT-CLINIT-15  write_files contains /opt/nestfleet/license.jwt entry with the token
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { readFile } from "node:fs/promises"

// Mock fs to avoid disk reads in unit tests
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("mock-file-content"),
}))

const mockReadFile = readFile as ReturnType<typeof vi.fn>

// Import after mocking
const { generateCloudInit, _resetCloudInitCache } = await import("../../../src/fleet/provisioning/cloud-init.js")

// Use a realistic-looking dummy JWT string — no need to actually sign for cloud-init tests
const DUMMY_LICENSE_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhY21lIn0.dummysignature"

const BASE_OPTS = {
  slug:                   "acme",
  baseDomain:             "nestfleet.dev",
  postgresPassword:       "aabbcc001122334455667788990011223344556677889900112233445566778899",
  jwtSecret:              "bbccdd001122334455667788990011223344556677889900112233445566778800",
  encryptionKey:          "ccddee001122334455667788990011223344556677889900112233445566778800",
  licenseSecret:          "ddee00112233445566778899001122334455667788990011223344556677880000",
  licenseToken:           DUMMY_LICENSE_TOKEN,
  bundledLlmApiKey:       "sk-google-test-key",
  bundledEmbeddingApiKey: "sk-google-embedding-key",
  opsPublicKey:           "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA ops@nestfleet.dev",
}

describe("generateCloudInit", () => {
  beforeEach(() => {
    _resetCloudInitCache()
    mockReadFile.mockResolvedValue("mock-file-content-line1\nmock-file-content-line2")
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("NF-UNIT-CLINIT-01: output starts with #cloud-config header", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml.trimStart()).toMatch(/^#cloud-config/)
  })

  it("NF-UNIT-CLINIT-02: NESTFLEET_DOMAIN contains slug", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("NESTFLEET_DOMAIN=acme.nestfleet.dev")
  })

  it("NF-UNIT-CLINIT-03: postgresPassword appears in DATABASE_URL and POSTGRES_PASSWORD", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain(BASE_OPTS.postgresPassword)
  })

  it("NF-UNIT-CLINIT-04: jwtSecret appears in JWT_SECRET line", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain(`JWT_SECRET=${BASE_OPTS.jwtSecret}`)
  })

  it("NF-UNIT-CLINIT-05: encryptionKey appears in ENCRYPTION_KEY line", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain(`ENCRYPTION_KEY=${BASE_OPTS.encryptionKey}`)
  })

  it("NF-UNIT-CLINIT-06: BILLING_ENABLED=false is set", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("BILLING_ENABLED=false")
  })

  it("NF-UNIT-CLINIT-07: REGISTRATION_ENABLED=true is set", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("REGISTRATION_ENABLED=true")
  })

  it("NF-UNIT-CLINIT-08: ssh_authorized_keys contains the ops public key", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain(BASE_OPTS.opsPublicKey)
  })

  it("NF-UNIT-CLINIT-09: runcmd includes docker compose up", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("docker compose")
    expect(yaml).toContain("up -d")
  })

  it("NF-UNIT-CLINIT-10: different slugs produce different NESTFLEET_DOMAIN values", async () => {
    const yaml1 = await generateCloudInit({ ...BASE_OPTS, slug: "acme" })
    _resetCloudInitCache()
    const yaml2 = await generateCloudInit({ ...BASE_OPTS, slug: "beta-corp" })
    expect(yaml1).toContain("NESTFLEET_DOMAIN=acme.nestfleet.dev")
    expect(yaml2).toContain("NESTFLEET_DOMAIN=beta-corp.nestfleet.dev")
    expect(yaml1).not.toContain("beta-corp")
    expect(yaml2).not.toContain("acme.nestfleet.dev")
  })

  it("NF-UNIT-CLINIT-11: LLM_PROVIDER=google and LLM_MODEL=gemini-2.5-flash-lite are injected", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("LLM_PROVIDER=google")
    expect(yaml).toContain("LLM_MODEL=gemini-2.5-flash-lite")
    expect(yaml).toContain("EMBEDDING_MODEL=gemini-embedding-001")
    expect(yaml).toContain("LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai")
    expect(yaml).toContain("EMBEDDING_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai")
    expect(yaml).toContain("EMBEDDING_DIMENSIONS=768")
  })

  it("NF-UNIT-CLINIT-12: S3 vars appear in .env when opts include them", async () => {
    const yaml = await generateCloudInit({
      ...BASE_OPTS,
      backupS3Endpoint:  "https://nbg1.your-objectstorage.com",
      backupS3AccessKey: "AKIAIOSFODNN7EXAMPLE",
      backupS3SecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      backupS3Bucket:    "my-nestfleet-backups",
    })
    expect(yaml).toContain("BACKUP_S3_ENDPOINT=https://nbg1.your-objectstorage.com")
    expect(yaml).toContain("BACKUP_S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE")
    expect(yaml).toContain("BACKUP_S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY")
    expect(yaml).toContain("BACKUP_S3_BUCKET=my-nestfleet-backups")
    expect(yaml).toContain("CUSTOMER_SLUG=acme")
  })

  it("NF-UNIT-CLINIT-13: S3 vars are empty strings (not 'undefined') when opts omit them", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("BACKUP_S3_ENDPOINT=\n")
    expect(yaml).toContain("BACKUP_S3_ACCESS_KEY=\n")
    expect(yaml).toContain("BACKUP_S3_SECRET_KEY=\n")
    expect(yaml).toContain("BACKUP_S3_BUCKET=nestfleet-backups")
    expect(yaml).not.toContain("undefined")
  })

  it("NF-UNIT-CLINIT-14: LICENSE_FILE_PATH env var is set to /opt/nestfleet/license.jwt", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("LICENSE_FILE_PATH=/opt/nestfleet/license.jwt")
  })

  it("NF-UNIT-CLINIT-15: write_files contains /opt/nestfleet/license.jwt with token and 0644 permissions", async () => {
    const yaml = await generateCloudInit(BASE_OPTS)
    expect(yaml).toContain("path: /opt/nestfleet/license.jwt")
    expect(yaml).toContain(DUMMY_LICENSE_TOKEN)
    // 0644 so the nestfleet container user (uid=999) can read it
    expect(yaml).toContain("permissions: '0644'")
  })

  it("NF-UNIT-CLINIT-16: docker-compose.customer.yml bind-mounts license.jwt into the api container", async () => {
    // This test reads the real compose file from disk (bypasses the fs mock)
    // to confirm the volume mount line is present — it would be invisible to
    // the cloud-init unit tests since readFile is mocked above.
    const { readFile: realReadFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
    const composeContent = await realReadFile(
      new URL("../../../docker-compose.customer.yml", import.meta.url),
      "utf-8"
    )
    expect(composeContent).toContain("/opt/nestfleet/license.jwt:/opt/nestfleet/license.jwt:ro")
  })
})
