/**
 * Operator real-time event stream — INFRA-01.
 *
 * GET /api/v1/products/:productId/events
 *   Auth-guarded SSE endpoint. The operator console subscribes here to receive
 *   real-time events for the active product (new chat messages, badge updates,
 *   forwarded notifications).
 *
 * Auth note: EventSource (browser API) does not support custom headers, so the
 * JWT is accepted via `?token=<jwt>` query param as a fallback in addition to
 * the standard `Authorization: Bearer` header. This is safe because:
 *   - The connection is HTTPS in production.
 *   - The token is the same short-lived JWT used everywhere else.
 *   - The query param is only used when a header cannot be sent.
 *
 * Events are sent as SSE with `event: operator` and JSON-encoded `data`.
 * A heartbeat ping is sent every 30 s to keep proxies from closing the conn.
 */

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { verifyJwt } from "../../auth/jwt.js"
import { subscribe } from "../../notifications/operator-registry.js"
import { logger } from "../../shared/logger.js"

export const productEventsRouter = new Hono()

productEventsRouter.get("/products/:productId/events", async (c) => {
  const productId = c.req.param("productId")

  // ── Auth: header first, query param fallback for EventSource ─────────────
  let token: string | undefined
  const authHeader = c.req.header("Authorization")
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice("Bearer ".length)
  } else {
    token = c.req.query("token")
  }

  if (!token) {
    return c.json({ error: "UNAUTHORIZED" }, 401)
  }

  let user: ReturnType<typeof verifyJwt>
  try {
    user = verifyJwt(token)
  } catch {
    return c.json({ error: "UNAUTHORIZED" }, 401)
  }

  // Product access check (mirrors requireAuth middleware)
  if (!user.roles.includes("admin")) {
    const allowed = user.productIds ?? []
    if (!allowed.includes(productId)) {
      return c.json({ error: "FORBIDDEN", message: "Product access denied" }, 403)
    }
  }

  // ── SSE stream ────────────────────────────────────────────────────────────
  return streamSSE(c, async (stream) => {
    logger.info({ productId, userId: user.sub }, "Operator SSE stream opened")

    // Initial connected event
    await stream.writeSSE({
      event: "operator",
      data:  JSON.stringify({ type: "connected", productId, ts: new Date().toISOString() }),
    })

    await new Promise<void>((resolve) => {
      let pingTimer: ReturnType<typeof setInterval>

      const cleanup = () => {
        clearInterval(pingTimer)
        unsubscribe()
        resolve()
      }

      const unsubscribe = subscribe(productId, async (event) => {
        try {
          await stream.writeSSE({ event: "operator", data: JSON.stringify(event) })
        } catch {
          cleanup()
        }
      })

      // Heartbeat every 30 s — keeps proxies and load balancers alive
      pingTimer = setInterval(async () => {
        try {
          await stream.writeSSE({
            event: "operator",
            data:  JSON.stringify({ type: "ping", ts: new Date().toISOString() }),
          })
        } catch {
          cleanup()
        }
      }, 30_000)

      // Cleanup on client disconnect
      stream.onAbort(() => {
        logger.info({ productId, userId: user.sub }, "Operator SSE stream closed by client")
        cleanup()
      })
    })
  })
})
