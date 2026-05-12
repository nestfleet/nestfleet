// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * AES-256-GCM symmetric encryption for secrets stored in the database.
 *
 * Encrypted values are prefixed with "enc:" so plaintext values (stored before
 * encryption was introduced) can be distinguished and read back transparently.
 *
 * Key: 32-byte (256-bit) value supplied as SECRET_ENCRYPTION_KEY env var (64 hex chars).
 * ENCRYPTION_KEY is a deprecated alias — it will be removed in v0.2.0.
 *
 * Format:  enc:<iv_hex>:<ciphertext_hex>:<auth_tag_hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGO    = "aes-256-gcm"
const IV_LEN  = 12   // bytes — 96-bit IV recommended for GCM
const TAG_LEN = 16   // bytes — 128-bit auth tag
const PREFIX  = "enc:"

function resolveKey(): Buffer {
  const primary = process.env.SECRET_ENCRYPTION_KEY
  const legacy  = process.env.ENCRYPTION_KEY

  const hex = (() => {
    if (primary) return primary
    if (legacy) {
      console.warn(
        "[DEPRECATED] ENCRYPTION_KEY is deprecated — rename to SECRET_ENCRYPTION_KEY. " +
        "Will be removed in v0.2.0."
      )
      return legacy
    }
    return null
  })()

  if (!hex) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY must be set. Generate with: openssl rand -hex 32"
    )
  }

  const buf = Buffer.from(hex, "hex")
  if (buf.length !== 32) {
    throw new Error(
      "SECRET_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes / 256 bits)"
    )
  }
  return buf
}

/**
 * Encrypt a plaintext string. Requires SECRET_ENCRYPTION_KEY (or deprecated ENCRYPTION_KEY).
 */
export function encryptSecret(plaintext: string): string {
  const key     = resolveKey()
  const iv      = randomBytes(IV_LEN)
  const cipher  = createCipheriv(ALGO, key, iv)
  const enc     = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag     = cipher.getAuthTag()

  return PREFIX + [iv, enc, tag].map((b) => b.toString("hex")).join(":")
}

/**
 * Decrypt a value returned from the database.
 * - If the value starts with "enc:" it is decrypted (key required).
 * - Otherwise the value is returned as-is (backward-compat plaintext).
 * - Returns null/undefined input unchanged.
 */
export function decryptSecret(stored: string | null | undefined): string | null | undefined {
  if (stored == null) return stored
  if (!stored.startsWith(PREFIX)) return stored   // plaintext — pass through

  const key   = resolveKey()
  const inner = stored.slice(PREFIX.length)
  const parts = inner.split(":")
  if (parts.length !== 3) throw new Error("Malformed encrypted secret: expected enc:<iv>:<ct>:<tag>")

  const ivHex  = parts[0]!
  const ctHex  = parts[1]!
  const tagHex = parts[2]!
  const iv     = Buffer.from(ivHex,  "hex")
  const ct     = Buffer.from(ctHex,  "hex")
  const tag    = Buffer.from(tagHex, "hex")

  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) {
    throw new Error("Malformed encrypted secret: incorrect IV or tag length")
  }

  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8")
}
