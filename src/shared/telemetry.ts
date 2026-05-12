// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * OpenTelemetry SDK initialisation.
 *
 * IMPORTANT: This module must be imported BEFORE any other application module
 * in src/index.ts so that auto-instrumentation patches libraries at startup.
 */

import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { config } from "./config.js"

let sdk: NodeSDK | null = null

export function initTelemetry(): void {
  if (sdk) return // Already initialised

  const instrumentations = [
    getNodeAutoInstrumentations({
      // Disable noisy file system instrumentation
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ]

  // Only configure exporter when endpoint is provided; otherwise SDK runs noop
  const sdkConfig: ConstructorParameters<typeof NodeSDK>[0] = {
    serviceName: config.OTEL_SERVICE_NAME,
    instrumentations,
  }

  if (config.OTEL_EXPORTER_OTLP_ENDPOINT) {
    const exporter = new OTLPTraceExporter({
      url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    })
    sdkConfig.spanProcessors = [new SimpleSpanProcessor(exporter)]
  }

  sdk = new NodeSDK(sdkConfig)
  sdk.start()
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown()
    sdk = null
  }
}
