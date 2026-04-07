/**
 * Hetzner Cloud API client — FEAT-001.
 *
 * Thin HTTP wrapper around the Hetzner Cloud API v1.
 * No SDK dependency — uses native fetch (Node 22).
 * All errors are thrown as HetznerApiError with status + message.
 * Retry logic is handled by pg-boss at the job level, not here.
 */

import { logger } from "../shared/logger.js"

const HETZNER_BASE = "https://api.hetzner.cloud/v1"

export class HetznerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(`Hetzner API error ${status}: ${message}`)
    this.name = "HetznerApiError"
  }
}

export interface CreateServerOpts {
  name:       string       // nestfleet-{slug}
  serverType: string       // cx23
  image:      string       // ubuntu-22.04
  location:   string       // nbg1
  userData:   string       // cloud-init YAML
  firewallId: number       // pre-created firewall ID
}

export interface HetznerClient {
  createServer(opts: CreateServerOpts): Promise<{ id: number; ip: string }>
  deleteServer(serverId: number): Promise<void>
  getServerStatus(serverId: number): Promise<"running" | "off" | "initializing" | "unknown">
  resetServer(serverId: number): Promise<void>
}

async function hetznerFetch(
  token: string,
  path: string,
  opts: RequestInit = {},
): Promise<unknown> {
  const res = await fetch(`${HETZNER_BASE}${path}`, {
    ...opts,
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  })

  if (!res.ok) {
    let code: string | undefined
    let message = res.statusText
    try {
      const body = await res.json() as { error?: { code?: string; message?: string } }
      code    = body.error?.code
      message = body.error?.message ?? message
    } catch { /* ignore parse error */ }
    throw new HetznerApiError(res.status, message, code)
  }

  if (res.status === 204) return null
  return res.json()
}

export function createHetznerClient(token: string): HetznerClient {
  return {
    async createServer(opts) {
      logger.info(
        { serverName: opts.name, serverType: opts.serverType, location: opts.location },
        "Hetzner: creating server",
      )
      const body = await hetznerFetch(token, "/servers", {
        method: "POST",
        body: JSON.stringify({
          name:        opts.name,
          server_type: opts.serverType,
          image:       opts.image,
          location:    opts.location,
          user_data:   opts.userData,
          firewalls:   [{ firewall: opts.firewallId }],
          start_after_create: true,
        }),
      }) as { server: { id: number; public_net: { ipv4: { ip: string } } } }

      const id = body.server.id
      const ip = body.server.public_net.ipv4.ip
      logger.info({ serverId: id, ip }, "Hetzner: server created")
      return { id, ip }
    },

    async deleteServer(serverId) {
      logger.info({ serverId }, "Hetzner: deleting server")
      await hetznerFetch(token, `/servers/${serverId}`, { method: "DELETE" })
      logger.info({ serverId }, "Hetzner: server deleted")
    },

    async getServerStatus(serverId) {
      const body = await hetznerFetch(token, `/servers/${serverId}`) as {
        server: { status: string }
      }
      const raw = body.server.status
      if (raw === "running")      return "running"
      if (raw === "off")          return "off"
      if (raw === "initializing") return "initializing"
      return "unknown"
    },

    async resetServer(serverId) {
      logger.info({ serverId }, "Hetzner: resetting server")
      await hetznerFetch(token, `/servers/${serverId}/actions/reset`, { method: "POST" })
      logger.info({ serverId }, "Hetzner: server reset action sent")
    },
  }
}
