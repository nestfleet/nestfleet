// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * NestFleet base error hierarchy.
 *
 * AppError is the base for all application-level errors.
 * Each subclass maps to an HTTP status code and a machine-readable error code.
 */

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: string
  public readonly details?: unknown

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
    this.details = details
    // Maintains proper prototype chain in TypeScript
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}

// ── 400 Bad Request ──────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details)
  }
}

// ── 401 Unauthorized ─────────────────────────────────────────────────────────

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR")
  }
}

// ── 403 Forbidden ────────────────────────────────────────────────────────────

export class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "AUTHORIZATION_ERROR")
  }
}

// ── 404 Not Found ────────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} '${id}' not found` : `${resource} not found`
    super(message, 404, "NOT_FOUND")
  }
}

// ── 409 Conflict ─────────────────────────────────────────────────────────────

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT")
  }
}

// ── 422 Unprocessable Entity ─────────────────────────────────────────────────

export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "BUSINESS_RULE_ERROR", details)
  }
}

// ── 503 Service Unavailable ───────────────────────────────────────────────────

export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} is currently unavailable`, 503, "SERVICE_UNAVAILABLE")
  }
}

// ── 429 Too Many Requests ─────────────────────────────────────────────────────

export class TokenBudgetError extends AppError {
  constructor(
    message: string,
    readonly productId: string,
    readonly actionType: string,
    readonly currentTokens: number,
    readonly hardLimit: number,
  ) {
    super(message, 429, "TOKEN_BUDGET_EXCEEDED")
  }
}

// ── Type guard ────────────────────────────────────────────────────────────────

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
