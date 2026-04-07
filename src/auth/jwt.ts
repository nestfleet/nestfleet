/**
 * JWT utilities — SPIKE-07.
 *
 * Uses the `jsonwebtoken` npm package.
 * Config is accessed first to fail fast on missing JWT_SECRET at startup.
 */

import jwt from "jsonwebtoken"
import { config } from "../shared/config.js"

export interface JwtPayload {
  sub:        string
  email:      string
  roles:      string[]
  productIds: string[]
  iat?:       number
  exp?:       number
}

const DEFAULT_EXPIRES_IN = "7d"

/**
 * Sign a JWT for the given payload.
 * @param payload - Claims to embed (without iat/exp — those are set by the library).
 * @param expiresIn - Optional duration string, e.g. "7d", "1h". Defaults to "7d".
 */
export function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  expiresIn: string = DEFAULT_EXPIRES_IN,
): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn, algorithm: "HS256" } as jwt.SignOptions)
}

/**
 * Verify and decode a JWT.
 * Throws `JsonWebTokenError` or `TokenExpiredError` on invalid / expired tokens.
 */
export function verifyJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] })
  if (typeof decoded === "string") {
    throw new Error("Unexpected string JWT payload")
  }
  const payload = decoded as JwtPayload
  return payload
}
