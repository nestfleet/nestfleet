// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

import pino from "pino"
import { config } from "./config.js"

/**
 * Structured JSON logger.
 * In development, pino-pretty formats output for readability.
 * In production/test, outputs raw JSON for log aggregators.
 */
const pinoOptions: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
  base: {
    service: "nestfleet",
    version: "0.1.0",
  },
  // Redact sensitive fields from logs — never log tokens, keys, or PII
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.api_key",
      "*.secret",
      "*.private_key",
      "*.license_key",
    ],
    censor: "[REDACTED]",
  },
}

if (config.NODE_ENV === "development") {
  pinoOptions.transport = {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
    },
  }
}

export const logger = pino(pinoOptions)

export type Logger = typeof logger
