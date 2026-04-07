/**
 * Unit tests: shared/errors
 */

import { describe, it, expect } from "vitest"
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  ServiceUnavailableError,
  isAppError,
} from "../../../src/shared/errors.js"

describe("AppError", () => {
  it("NF-UNIT-ERR-01: sets statusCode, code, and message", () => {
    const err = new AppError("something went wrong", 500, "TEST_ERROR")
    expect(err.statusCode).toBe(500)
    expect(err.code).toBe("TEST_ERROR")
    expect(err.message).toBe("something went wrong")
    expect(err.name).toBe("AppError")
  })

  it("NF-UNIT-ERR-02: toJSON includes error code and message", () => {
    const err = new AppError("bad", 400, "BAD")
    const json = err.toJSON()
    expect(json.error).toBe("BAD")
    expect(json.message).toBe("bad")
    expect(json).not.toHaveProperty("details")
  })

  it("NF-UNIT-ERR-03: toJSON includes details when provided", () => {
    const err = new AppError("bad", 400, "BAD", { field: "name" })
    expect(err.toJSON().details).toEqual({ field: "name" })
  })
})

describe("ValidationError", () => {
  it("NF-UNIT-ERR-04: has 400 status and VALIDATION_ERROR code", () => {
    const err = new ValidationError("invalid input")
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe("VALIDATION_ERROR")
  })
})

describe("AuthenticationError", () => {
  it("NF-UNIT-ERR-05: has 401 status and default message", () => {
    const err = new AuthenticationError()
    expect(err.statusCode).toBe(401)
    expect(err.message).toBe("Authentication required")
  })
})

describe("AuthorizationError", () => {
  it("NF-UNIT-ERR-06: has 403 status", () => {
    const err = new AuthorizationError()
    expect(err.statusCode).toBe(403)
  })
})

describe("NotFoundError", () => {
  it("NF-UNIT-ERR-07: includes resource name in message", () => {
    const err = new NotFoundError("Case", "abc-123")
    expect(err.statusCode).toBe(404)
    expect(err.message).toContain("Case")
    expect(err.message).toContain("abc-123")
  })

  it("NF-UNIT-ERR-08: works without id", () => {
    const err = new NotFoundError("Case")
    expect(err.message).toBe("Case not found")
  })
})

describe("ConflictError", () => {
  it("NF-UNIT-ERR-09: has 409 status", () => {
    const err = new ConflictError("already exists")
    expect(err.statusCode).toBe(409)
  })
})

describe("BusinessRuleError", () => {
  it("NF-UNIT-ERR-10: has 422 status", () => {
    const err = new BusinessRuleError("rule violated")
    expect(err.statusCode).toBe(422)
  })
})

describe("ServiceUnavailableError", () => {
  it("NF-UNIT-ERR-11: has 503 status and includes service name", () => {
    const err = new ServiceUnavailableError("GitHub")
    expect(err.statusCode).toBe(503)
    expect(err.message).toContain("GitHub")
  })
})

describe("isAppError", () => {
  it("NF-UNIT-ERR-12: returns true for AppError subclasses", () => {
    expect(isAppError(new ValidationError("x"))).toBe(true)
    expect(isAppError(new NotFoundError("Case"))).toBe(true)
  })

  it("NF-UNIT-ERR-13: returns false for plain errors and other values", () => {
    expect(isAppError(new Error("plain"))).toBe(false)
    expect(isAppError("string")).toBe(false)
    expect(isAppError(null)).toBe(false)
  })
})
