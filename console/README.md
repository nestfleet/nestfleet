# NestFleet Console

Operator console for the NestFleet incident-management platform.

## Prerequisites

- Node.js 20+
- NestFleet API running (default port 3001)

## Getting started

```bash
cp .env.local.example .env.local
# edit .env.local — only NEXT_PUBLIC_API_URL is required
npm install
npm run dev        # http://localhost:3002
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | NestFleet API base URL (e.g. `http://localhost:3001`) |
| `NEXT_PUBLIC_PRODUCT_ID` | No (deprecated) | Legacy single-product hint. After first login the `nf_last_product` cookie takes over and this variable can be removed. |

## URL structure

Since DEFERRED-21, all product-scoped pages live under `/p/[slug]/`:

```
/p/acme/queue
/p/acme/cases
/p/acme/approvals
/p/acme/pr-drafts
/p/acme/knowledge
/p/acme/analytics
/p/acme/notifications
/p/acme/compliance
/p/acme/settings
```

The legacy paths (`/cases`, `/queue`, etc.) remain active for backwards compatibility.

Navigating to `/` when the `nf_last_product` cookie is set redirects directly to that product's queue.

## Adding a product

Open the product switcher in the sidebar → **Add Product**. Requires Starter tier or above.

## Tech stack

- Next.js 15 (App Router)
- React 19
- Tailwind CSS
- SWR (data fetching + caching)
- TypeScript
