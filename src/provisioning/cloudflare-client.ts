/**
 * Cloudflare DNS API client — FEAT-001.
 *
 * Creates and deletes A records for customer subdomains.
 * proxied: false is mandatory — Caddy needs direct TCP for ACME HTTP-01 challenge.
 * ttl: 60 is the Cloudflare minimum for non-proxied records.
 */

import { logger } from "../shared/logger.js"

const CF_BASE = "https://api.cloudflare.com/client/v4"

export class CloudflareApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: unknown[],
  ) {
    super(`Cloudflare API error ${status}: ${message}`)
    this.name = "CloudflareApiError"
  }
}

export interface CloudflareClient {
  createDnsRecord(zoneId: string, slug: string, ip: string, baseDomain: string): Promise<{ id: string }>
  deleteDnsRecord(zoneId: string, recordId: string): Promise<void>
}

async function cfFetch(
  token: string,
  path: string,
  opts: RequestInit = {},
): Promise<unknown> {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  })

  const body = await res.json() as { success: boolean; result?: unknown; errors?: Array<{ message: string }> }

  if (!body.success) {
    const message = body.errors?.[0]?.message ?? res.statusText
    throw new CloudflareApiError(res.status, message, body.errors)
  }

  return body.result
}

export function createCloudflareClient(token: string): CloudflareClient {
  return {
    async createDnsRecord(zoneId, slug, ip, baseDomain) {
      const name = `${slug}.${baseDomain}`
      logger.info({ name, ip }, "Cloudflare: creating DNS A record")

      const result = await cfFetch(token, `/zones/${zoneId}/dns_records`, {
        method: "POST",
        body: JSON.stringify({
          type:    "A",
          name,
          content: ip,
          proxied: false,   // mandatory: Caddy ACME HTTP-01 needs direct TCP on port 80
          ttl:     60,      // Cloudflare minimum for non-proxied records
        }),
      }) as { id: string }

      logger.info({ recordId: result.id, name }, "Cloudflare: DNS record created")
      return { id: result.id }
    },

    async deleteDnsRecord(zoneId, recordId) {
      logger.info({ recordId }, "Cloudflare: deleting DNS record")
      await cfFetch(token, `/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" })
      logger.info({ recordId }, "Cloudflare: DNS record deleted")
    },
  }
}
