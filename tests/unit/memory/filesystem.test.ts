/**
 * Unit tests for the filesystem source adapter.
 * Covers inferSourceType and inferAudience — both are pure, synchronous functions.
 */

import { describe, it, expect } from "vitest"
import {
  inferSourceType,
  inferAudience,
} from "../../../src/memory/sources/filesystem.js"

// ── inferSourceType ───────────────────────────────────────────────────────────

describe("inferSourceType", () => {
  describe("openapi format always returns openapi_spec", () => {
    it("returns openapi_spec for openapi.yaml", () => {
      expect(inferSourceType("openapi.yaml", "openapi")).toBe("openapi_spec")
    })

    it("returns openapi_spec for api/swagger.yml", () => {
      expect(inferSourceType("api/swagger.yml", "openapi")).toBe("openapi_spec")
    })

    it("returns openapi_spec for openapi.json", () => {
      expect(inferSourceType("openapi.json", "openapi")).toBe("openapi_spec")
    })
  })

  describe("README detection by filename", () => {
    it("returns readme for README.md (root level)", () => {
      expect(inferSourceType("README.md", "markdown")).toBe("readme")
    })

    it("returns readme for README.mdx", () => {
      expect(inferSourceType("README.mdx", "markdown")).toBe("readme")
    })

    it("returns readme for mixed-case readme.md", () => {
      // The implementation lowercases the base filename before comparing
      expect(inferSourceType("readme.md", "markdown")).toBe("readme")
    })
  })

  describe("changelog detection by filename", () => {
    it("returns changelog for changelog.md", () => {
      expect(inferSourceType("changelog.md", "markdown")).toBe("changelog")
    })

    it("returns changelog for CHANGELOG.md (case-insensitive)", () => {
      expect(inferSourceType("CHANGELOG.md", "markdown")).toBe("changelog")
    })

    it("returns changelog for changelog.mdx", () => {
      expect(inferSourceType("changelog.mdx", "markdown")).toBe("changelog")
    })
  })

  describe("FAQ detection by path segment", () => {
    it("returns faq for docs/faq.md", () => {
      expect(inferSourceType("docs/faq.md", "markdown")).toBe("faq")
    })

    it("returns faq for docs/FAQ.md (case-insensitive)", () => {
      expect(inferSourceType("docs/FAQ.md", "markdown")).toBe("faq")
    })

    it("returns faq for support/faq-guide.md (contains literal 'faq')", () => {
      expect(inferSourceType("support/faq-guide.md", "markdown")).toBe("faq")
    })
  })

  describe("architecture_overview detection", () => {
    it("returns architecture_overview for docs/architecture-overview.md", () => {
      expect(inferSourceType("docs/architecture-overview.md", "markdown")).toBe("architecture_overview")
    })

    it("returns architecture_overview for docs/architecture.md", () => {
      expect(inferSourceType("docs/architecture.md", "markdown")).toBe("architecture_overview")
    })
  })

  describe("product_spec detection", () => {
    it("returns product_spec for docs/spec/product-specification.md", () => {
      expect(inferSourceType("docs/spec/product-specification.md", "markdown")).toBe("product_spec")
    })

    it("returns product_spec for spec/feature.md (path contains 'spec')", () => {
      expect(inferSourceType("spec/feature.md", "markdown")).toBe("product_spec")
    })

    it("returns product_spec for docs/product-specification.md", () => {
      expect(inferSourceType("docs/product-specification.md", "markdown")).toBe("product_spec")
    })
  })

  describe("known_issues detection", () => {
    it("returns known_issues for docs/known-issues.md", () => {
      expect(inferSourceType("docs/known-issues.md", "markdown")).toBe("known_issues")
    })

    it("returns known_issues for docs/known_issues.md (underscore variant)", () => {
      expect(inferSourceType("docs/known_issues.md", "markdown")).toBe("known_issues")
    })
  })

  describe("troubleshooting_guide detection", () => {
    it("returns troubleshooting_guide for docs/troubleshooting.md", () => {
      expect(inferSourceType("docs/troubleshooting.md", "markdown")).toBe("troubleshooting_guide")
    })

    it("returns troubleshooting_guide for ops/runbook.md", () => {
      expect(inferSourceType("ops/runbook.md", "markdown")).toBe("troubleshooting_guide")
    })
  })

  describe("deployment_guide detection", () => {
    it("returns deployment_guide for docs/deployment.md", () => {
      expect(inferSourceType("docs/deployment.md", "markdown")).toBe("deployment_guide")
    })

    it("returns deployment_guide for DEPLOYMENT.md", () => {
      expect(inferSourceType("DEPLOYMENT.md", "markdown")).toBe("deployment_guide")
    })
  })

  describe("api_docs detection", () => {
    it("returns api_docs for docs/api-docs.md", () => {
      expect(inferSourceType("docs/api-docs.md", "markdown")).toBe("api_docs")
    })

    it("returns api_docs for docs/api_docs.md (underscore variant)", () => {
      expect(inferSourceType("docs/api_docs.md", "markdown")).toBe("api_docs")
    })
  })

  describe("technical_spec detection", () => {
    it("returns product_spec for docs/technical-spec.md because 'spec' matches before 'technical'", () => {
      // Implementation checks includes("spec") before includes("technical"), so
      // a path containing both matches product_spec (the earlier guard wins).
      expect(inferSourceType("docs/technical-spec.md", "markdown")).toBe("product_spec")
    })

    it("returns technical_spec for docs/technical.md", () => {
      expect(inferSourceType("docs/technical.md", "markdown")).toBe("technical_spec")
    })
  })

  describe("fallback to feature_spec for unclassified markdown", () => {
    it("returns feature_spec for docs/some-feature.md", () => {
      expect(inferSourceType("docs/some-feature.md", "markdown")).toBe("feature_spec")
    })

    it("returns feature_spec for notes.md", () => {
      expect(inferSourceType("notes.md", "markdown")).toBe("feature_spec")
    })
  })
})

// ── inferAudience ─────────────────────────────────────────────────────────────

describe("inferAudience", () => {
  describe("internal paths", () => {
    it("returns internal for docs/internal/runbook.md", () => {
      expect(inferAudience("docs/internal/runbook.md")).toBe("internal")
    })

    it("returns internal for any/internal/setup.md (contains /internal/ with slashes)", () => {
      expect(inferAudience("any/internal/setup.md")).toBe("internal")
    })

    it("returns internal for src/ops/config.md (contains /ops/ with slashes)", () => {
      expect(inferAudience("src/ops/config.md")).toBe("internal")
    })

    it("returns internal for docs/runbooks/deploy.md (contains /runbooks/ with slashes)", () => {
      expect(inferAudience("docs/runbooks/deploy.md")).toBe("internal")
    })

    it("returns internal for /runbook path segment", () => {
      expect(inferAudience("docs/runbook.md")).toBe("internal")
    })

    it("returns internal for uppercase INTERNAL/ path (case-insensitive)", () => {
      expect(inferAudience("docs/INTERNAL/guide.md")).toBe("internal")
    })
  })

  describe("public paths", () => {
    it("returns public for docs/public/readme.md", () => {
      expect(inferAudience("docs/public/readme.md")).toBe("public")
    })

    it("returns public for README.md (root level)", () => {
      expect(inferAudience("README.md")).toBe("public")
    })

    it("returns public for docs/faq.md", () => {
      expect(inferAudience("docs/faq.md")).toBe("public")
    })

    it("returns public for changelog.md", () => {
      expect(inferAudience("changelog.md")).toBe("public")
    })

    it("returns public for docs/architecture.md", () => {
      expect(inferAudience("docs/architecture.md")).toBe("public")
    })
  })
})
