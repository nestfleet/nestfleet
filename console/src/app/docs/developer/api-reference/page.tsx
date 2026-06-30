// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors

import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "API Reference — NestFleet Docs",
  description: "NestFleet REST API reference: authentication, endpoints, and usage examples.",
}

export default function ApiReferencePage() {
  return (
    <DocsLayout
      prev={{ label: "Architecture", href: "/docs/developer/architecture" }}
      next={{ label: "Contributing", href: "/docs/developer/contributing" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        API Reference
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        The NestFleet API is a REST API served by the Hono server. All endpoints are prefixed with
        <code className="bg-gray-100 px-1 rounded-sm text-xs ml-1">/api/v1</code> and return JSON.
        A full OpenAPI specification is coming soon — this page covers the main endpoint groups and
        authentication flow.
      </p>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          <strong>Base URL:</strong>{" "}
          <code className="bg-indigo-100 px-1 rounded-sm text-xs">https://your-domain/api/v1</code>
          {" "}for self-hosted, or{" "}
          <code className="bg-indigo-100 px-1 rounded-sm text-xs">https://api.nestfleet.dev/v1</code>
          {" "}for SaaS. All requests must use HTTPS in production.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Authentication</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        The API uses JWT Bearer token authentication. Obtain a token by calling the login endpoint,
        then include it in the <code className="bg-gray-100 px-1 rounded-sm text-xs">Authorization</code> header
        of every subsequent request:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`Authorization: Bearer <your-jwt-token>`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Access tokens are short-lived (default: 15 minutes). Use the refresh endpoint to obtain a
        new access token using the refresh token (returned in an httpOnly cookie on login).
        Token expiry is returned in the login response as <code className="bg-gray-100 px-1 rounded-sm text-xs">expiresIn</code> (seconds).
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Login + list cases example</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        A complete example using curl — authenticate, capture the token, then list open cases:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`# Step 1: Login and capture the access token
TOKEN=$(curl -s -X POST https://your-domain/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@example.com","password":"your-password"}' \\
  | jq -r '.accessToken')

# Step 2: List open cases for product ID 1
curl -s https://your-domain/api/v1/cases?productId=1&status=open \\
  -H "Authorization: Bearer $TOKEN" \\
  | jq .`}</pre>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Endpoint groups</h2>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">Auth</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[240px]">Endpoint</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["POST /auth/login", "Authenticate with email and password. Returns accessToken and sets refresh cookie."],
            ["POST /auth/register", "Create a new account (only when REGISTRATION_ENABLED=true)."],
            ["POST /auth/refresh", "Exchange a refresh token cookie for a new access token."],
            ["POST /auth/logout", "Invalidate the refresh token and clear the cookie."],
            ["POST /auth/reset-password/request", "Send a password reset email."],
            ["POST /auth/reset-password/confirm", "Set a new password using the reset token from the email."],
          ].map(([endpoint, desc]) => (
            <tr key={endpoint}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{endpoint}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">Cases</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[260px]">Endpoint</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["GET /cases", "List cases. Filter by productId, status, severity, type, assigneeId, channel. Paginated."],
            ["GET /cases/:id", "Get a single case with full detail: triage result, notes, linked issues, reply history."],
            ["PATCH /cases/:id/status", "Update case status. Body: { status, note? }"],
            ["PATCH /cases/:id/assign", "Assign the case to a user. Body: { userId }"],
            ["PATCH /cases/:id/severity", "Override the AI-assigned severity. Body: { severity: 'P0'|'P1'|...'P4' }"],
            ["POST /cases/:id/notes", "Add an internal note to the case. Body: { content }"],
            ["POST /cases/:id/escalate", "Escalate to a lead. Body: { targetUserId, note? }"],
            ["POST /cases/:id/change-request", "Create a change request from this case."],
          ].map(([endpoint, desc]) => (
            <tr key={endpoint}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{endpoint}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">Products</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[240px]">Endpoint</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["GET /products", "List all products the authenticated user has access to."],
            ["POST /products", "Create a new product. Admin only."],
            ["GET /products/:id", "Get product details including channel configuration."],
            ["PATCH /products/:id", "Update product settings. Admin only."],
            ["DELETE /products/:id", "Archive a product. Admin only."],
          ].map(([endpoint, desc]) => (
            <tr key={endpoint}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{endpoint}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">Users</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[240px]">Endpoint</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["GET /users", "List team members. Admin only."],
            ["POST /users/invite", "Invite a new user by email. Admin only."],
            ["GET /users/:id", "Get user profile and roles."],
            ["PATCH /users/:id", "Update user details or roles. Admin only."],
            ["PATCH /users/:id/deactivate", "Deactivate a user account. Admin only."],
            ["POST /users/:id/reset-password", "Send a password reset email. Admin only."],
          ].map(([endpoint, desc]) => (
            <tr key={endpoint}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{endpoint}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">Knowledge Base</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[260px]">Endpoint</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["GET /knowledge/articles", "List articles for a product. Filter by type, tags."],
            ["POST /knowledge/articles", "Create a new article. Knowledge Lead or Admin only."],
            ["PATCH /knowledge/articles/:id", "Update an article. Triggers re-embedding job."],
            ["DELETE /knowledge/articles/:id", "Delete an article. Knowledge Lead or Admin only."],
            ["GET /knowledge/known-issues", "List known issues for a product."],
            ["POST /knowledge/known-issues", "Create a new known issue."],
            ["PATCH /knowledge/known-issues/:id", "Update a known issue status, workaround, or fix version."],
          ].map(([endpoint, desc]) => (
            <tr key={endpoint}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{endpoint}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">Change Requests</h3>
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[260px]">Endpoint</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["GET /change-requests", "List change requests. Filter by productId, status."],
            ["GET /change-requests/:id", "Get CR detail with PR draft, risk assessment, and audit trail."],
            ["POST /change-requests/:id/approve", "Approve a CR. Change Lead role required. Body: { rationale? }"],
            ["POST /change-requests/:id/reject", "Reject a CR. Change Lead role required. Body: { rationale }"],
            ["POST /change-requests/:id/push-github", "Push the approved PR draft to GitHub. Opens a PR in the product repo."],
          ].map(([endpoint, desc]) => (
            <tr key={endpoint}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{endpoint}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-base font-semibold text-gray-800 mt-5 mb-2">Audit & Health</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[240px]">Endpoint</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["GET /audit", "List audit events. Filter by entityType, entityId, actorId. Admin only. Paginated."],
            ["GET /health", "Health check. Returns {status, db, version}. No auth required."],
          ].map(([endpoint, desc]) => (
            <tr key={endpoint}>
              <td className="px-3 py-2 border border-gray-200 align-top font-mono text-xs text-indigo-700">{endpoint}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Error responses</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        All error responses follow a consistent shape:
      </p>
      <div className="bg-gray-900 rounded-lg p-4 mb-6 overflow-x-auto">
        <pre className="text-sm text-gray-100 font-mono whitespace-pre">{`{
  "error": "Unauthorised",
  "message": "JWT token expired",
  "statusCode": 401
}`}</pre>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Validation errors (400) include a <code className="bg-gray-100 px-1 rounded-sm text-xs">details</code> array
        with per-field error messages from Zod.
      </p>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          A full OpenAPI 3.1 specification (Swagger UI) is coming in a future release. Until then,
          the Hono route files in <code className="bg-indigo-100 px-1 rounded-sm text-xs">src/api/routes/</code> are
          the authoritative source of truth for request and response shapes — each route validates
          its inputs with Zod schemas that double as the type contract.
        </p>
      </div>
    </DocsLayout>
  )
}
