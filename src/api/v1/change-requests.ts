/**
 * Change Requests API — SLICE-01.
 *
 * Routes for reading change requests scoped to a product or a specific case.
 *
 * Routes:
 *   GET  /api/v1/products/:productId/change-requests               — list with optional filters
 *   GET  /api/v1/products/:productId/change-requests/:crId         — get a single change request
 *   GET  /api/v1/products/:productId/cases/:caseId/change-requests — list by case
 *
 * Protected by requireAuth — SLICE-05.
 */

import { Hono } from "hono"
import { z } from "zod"
import { logger } from "../../shared/logger.js"
import { requireAuth } from "../../auth/middleware.js"
import type { AuthVariables } from "../../auth/middleware.js"
import {
  findChangeRequestById,
  findChangeRequestsByProduct,
  findChangeRequestsByCase,
  ChangeRequestStatusSchema,
} from "../../infra/db/repositories/change-requests.js"

export const changeRequestsRouter = new Hono<{ Variables: AuthVariables }>()

// ── Query param schemas ────────────────────────────────────────────────────────

const ListChangeRequestsQuerySchema = z.object({
  status: z.preprocess(
    (v) => (v === undefined ? undefined : v),
    ChangeRequestStatusSchema.optional(),
  ),
  limit:  z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

// ── GET /api/v1/products/:productId/change-requests ───────────────────────────

changeRequestsRouter.get("/products/:productId/change-requests", requireAuth(), async (c) => {
  const productId = c.req.param("productId")

  const queryParsed = ListChangeRequestsQuerySchema.safeParse(c.req.query())
  if (!queryParsed.success) {
    return c.json({ error: "Invalid query parameters", details: queryParsed.error.issues }, 400)
  }

  const { status, limit, offset } = queryParsed.data

  try {
    const changeRequests = await findChangeRequestsByProduct(productId, { status, limit, offset })

    return c.json({
      data: changeRequests,
      meta: {
        productId,
        count:   changeRequests.length,
        limit,
        offset,
        filters: { status },
      },
    })
  } catch (err) {
    logger.error({ err, productId }, "Failed to list change requests")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── GET /api/v1/products/:productId/change-requests/:crId ─────────────────────

changeRequestsRouter.get("/products/:productId/change-requests/:crId", requireAuth(), async (c) => {
  const productId = c.req.param("productId")
  const crId      = c.req.param("crId")

  try {
    const changeRequest = await findChangeRequestById(crId)

    if (!changeRequest) {
      return c.json({ error: "Change request not found" }, 404)
    }

    // Ensure the change request belongs to the requested product
    if (changeRequest.product_id !== productId) {
      return c.json({ error: "Change request not found" }, 404)
    }

    return c.json({ data: changeRequest })
  } catch (err) {
    logger.error({ err, productId, crId }, "Failed to fetch change request")
    return c.json({ error: "Internal server error" }, 500)
  }
})

// ── GET /api/v1/products/:productId/cases/:caseId/change-requests ─────────────

changeRequestsRouter.get("/products/:productId/cases/:caseId/change-requests", requireAuth(), async (c) => {
  const productId = c.req.param("productId")
  const caseId    = c.req.param("caseId")

  try {
    const changeRequests = await findChangeRequestsByCase(caseId)

    // Filter to only those belonging to the requested product (integrity at app layer)
    const filtered = changeRequests.filter((cr) => cr.product_id === productId)

    return c.json({
      data: filtered,
      meta: {
        productId,
        caseId,
        count: filtered.length,
      },
    })
  } catch (err) {
    logger.error({ err, productId, caseId }, "Failed to list change requests by case")
    return c.json({ error: "Internal server error" }, 500)
  }
})
