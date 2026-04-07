import type { Metadata } from "next"
import Link from "next/link"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = { title: "Self-Hosting — NestFleet Docs" }

const STEPS = [
  { label: "Prerequisites",         href: "/docs/self-hosting/prerequisites",  desc: "Docker, PostgreSQL, LLM API key, and network requirements." },
  { label: "GitHub App Setup",      href: "/docs/self-hosting/github-app",     desc: "Create and configure the GitHub App for PR drafting and issue ingestion." },
  { label: "Environment Variables", href: "/docs/self-hosting/environment",    desc: "Full reference for every configuration option." },
  { label: "Docker Compose",        href: "/docs/self-hosting/docker",         desc: "Production deployment with Caddy TLS, PostgreSQL, and the API + console." },
  { label: "Backup & Restore",      href: "/docs/self-hosting/backup",         desc: "Automated pg_dump backups and restoration procedure." },
  { label: "Upgrading",             href: "/docs/self-hosting/upgrading",      desc: "Pull new images, run migrations, zero-downtime restart." },
]

export default function SelfHostingPage() {
  return (
    <DocsLayout
      prev={{ label: "Quick Start (SaaS)", href: "/docs/quickstart" }}
      next={{ label: "Prerequisites", href: "/docs/self-hosting/prerequisites" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">Self-Hosting</h1>
      <p className="text-lg text-gray-500 mb-8 leading-relaxed">
        Run NestFleet on your own infrastructure. AGPL-3.0 open source — free forever.
      </p>

      <p className="text-gray-600 leading-relaxed mb-4">
        Self-hosted NestFleet runs as two Docker containers (API + Next.js console) backed by
        PostgreSQL. A bundled Caddy reverse proxy handles TLS automatically via Let&apos;s Encrypt.
        Your data never leaves your infrastructure.
      </p>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-8">
        <p className="text-sm text-amber-900 leading-relaxed">
          <strong>Community tier limit:</strong> Self-hosted deployments run in Community mode by
          default, which supports <strong>1 active product</strong>. Paid tiers are available on{" "}
          <a href="https://nestfleet.dev" className="text-amber-700 underline">nestfleet.dev</a> managed hosting.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">Setup steps</h2>
      <div className="space-y-3">
        {STEPS.map((step, i) => (
          <Link
            key={step.href}
            href={step.href}
            className="group flex items-start gap-4 border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600 ring-1 ring-indigo-200">
              {i + 1}
            </span>
            <div>
              <h3 className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors mb-0.5">
                {step.label}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </DocsLayout>
  )
}
