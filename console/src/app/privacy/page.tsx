import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy — NestFleet",
  description: "NestFleet Privacy Policy — how we collect, use, and protect your data.",
}

const LAST_UPDATED = "2026-04-07"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Minimal nav */}
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white text-xs">⚡</span>
            <span className="font-bold text-gray-900 text-sm">NestFleet</span>
          </Link>
          <Link href="/terms" className="text-sm text-indigo-600 hover:underline">
            Terms of Service →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 sm:px-8 py-12">
        {/* Draft banner */}
        <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Draft document.</strong> This Privacy Policy is a placeholder and is not yet the
          final legal document. A GDPR-compliant version will be published before paid plans
          are made available to users. Questions?{" "}
          <a href="mailto:privacy@nestfleet.dev" className="underline">privacy@nestfleet.dev</a>
        </div>

        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-gray prose-sm max-w-none space-y-8">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Data Controller</h2>
            <p className="text-gray-600 leading-relaxed">
              NestFleet (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is the data controller for personal data processed
              through the NestFleet SaaS service (nestfleet.dev). The legal entity details will be
              updated upon company registration. For data protection enquiries, contact:{" "}
              <a href="mailto:privacy@nestfleet.dev" className="text-indigo-600 hover:underline">
                privacy@nestfleet.dev
              </a>
            </p>
            <p className="mt-3 text-gray-600 leading-relaxed">
              <strong>Self-hosted deployments:</strong> If you run NestFleet on your own
              infrastructure, you are the data controller for all data processed within your instance.
              This Privacy Policy applies only to the managed SaaS service at nestfleet.dev.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Data We Collect</h2>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">Account Data</h3>
            <ul className="space-y-1 text-gray-600 list-disc list-inside">
              <li>Email address and display name (provided at registration)</li>
              <li>Encrypted password hash (never stored in plaintext)</li>
              <li>Account role and product association</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">Product Configuration Data</h3>
            <ul className="space-y-1 text-gray-600 list-disc list-inside">
              <li>Product name, slug, and stage metadata</li>
              <li>LLM provider and model selection (API keys stored encrypted)</li>
              <li>GitHub integration settings (PAT tokens stored encrypted)</li>
              <li>Lead role assignments (email addresses)</li>
              <li>Support policy configuration</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">Operational Data (Signal Processing)</h3>
            <ul className="space-y-1 text-gray-600 list-disc list-inside">
              <li>Inbound support signals: email content, sender details, subject lines</li>
              <li>Cases: triage decisions, severity, status history, AI-generated content</li>
              <li>Audit events: actions taken, timestamps, operator IDs</li>
              <li>Knowledge base articles you create</li>
              <li>Change request metadata and GitHub PR links</li>
            </ul>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">Technical Data</h3>
            <ul className="space-y-1 text-gray-600 list-disc list-inside">
              <li>Server-side structured logs (no raw request bodies logged)</li>
              <li>Health and performance metrics (anonymised)</li>
              <li>IP addresses in access logs (retained for 30 days)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Legal Basis for Processing (GDPR)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Processing Purpose</th>
                    <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Legal Basis</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  {[
                    ["Provide the Service (account, product, cases)", "Contract performance (Art. 6(1)(b))"],
                    ["Billing and subscription management", "Contract performance (Art. 6(1)(b))"],
                    ["Security, fraud prevention, abuse detection", "Legitimate interests (Art. 6(1)(f))"],
                    ["Improving the Service (anonymised analytics)", "Legitimate interests (Art. 6(1)(f))"],
                    ["Marketing communications (if opted in)", "Consent (Art. 6(1)(a))"],
                    ["Legal compliance and dispute resolution", "Legal obligation (Art. 6(1)(c))"],
                  ].map(([purpose, basis]) => (
                    <tr key={purpose}>
                      <td className="px-3 py-2 border border-gray-200">{purpose}</td>
                      <td className="px-3 py-2 border border-gray-200">{basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Third-Party Processors</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              We share data with the following third-party processors. All processors are contractually
              bound to protect your data and process it only on our instructions.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Processor</th>
                    <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Purpose</th>
                    <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Location</th>
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  {[
                    ["Hetzner Online GmbH", "VPS hosting, object storage", "EU (Germany)"],
                    ["Cloudflare, Inc.", "DNS, TLS, CDN", "EU/US (SCCs applied)"],
                    ["Stripe, Inc.", "Payment processing, billing", "US (SCCs applied)"],
                    ["GitHub, Inc.", "Source code integration (PR drafting)", "US (SCCs applied)"],
                    ["LLM providers (OpenAI / Anthropic / Google)", "AI inference (your API key, your contract)", "Per provider"],
                  ].map(([name, purpose, location]) => (
                    <tr key={name}>
                      <td className="px-3 py-2 border border-gray-200 font-medium">{name}</td>
                      <td className="px-3 py-2 border border-gray-200">{purpose}</td>
                      <td className="px-3 py-2 border border-gray-200">{location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Data Retention</h2>
            <ul className="space-y-2 text-gray-600 list-disc list-inside">
              <li>Account data: retained for the lifetime of your account + 30 days post-deletion grace period.</li>
              <li>Case and signal data: retained for the duration of your subscription + 30-day export window after termination.</li>
              <li>Billing records: retained for 7 years to comply with financial regulation.</li>
              <li>Access logs: retained for 30 days, then purged.</li>
              <li>Anonymised usage analytics: retained indefinitely.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Your Rights (GDPR)</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              If you are in the EU/EEA or UK, you have the following rights:
            </p>
            <ul className="space-y-2 text-gray-600 list-disc list-inside">
              <li><strong>Access:</strong> Request a copy of your personal data.</li>
              <li><strong>Rectification:</strong> Correct inaccurate data.</li>
              <li><strong>Erasure:</strong> Request deletion of your personal data (&ldquo;right to be forgotten&rdquo;).</li>
              <li><strong>Portability:</strong> Receive your data in a machine-readable format (JSON/CSV).</li>
              <li><strong>Restriction:</strong> Request we restrict processing of your data.</li>
              <li><strong>Objection:</strong> Object to processing based on legitimate interests.</li>
              <li><strong>Withdraw consent:</strong> Where processing is based on consent, withdraw it at any time.</li>
            </ul>
            <p className="mt-3 text-gray-600 leading-relaxed">
              To exercise any of these rights, submit a Data Subject Access Request (DSAR) to{" "}
              <a href="mailto:privacy@nestfleet.dev" className="text-indigo-600 hover:underline">
                privacy@nestfleet.dev
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Cookies and Tracking</h2>
            <p className="text-gray-600 leading-relaxed">
              The NestFleet console uses a single session cookie (<code className="bg-gray-100 px-1 rounded text-xs">nf_last_product</code>)
              to remember your last-visited product. No third-party tracking cookies, no analytics
              pixels. The landing page (nestfleet.dev) does not use any tracking scripts.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Security</h2>
            <p className="text-gray-600 leading-relaxed">
              We implement technical and organisational measures to protect your data, including:
              AES-256 encryption of secrets at rest, TLS 1.3 in transit, parameterised SQL queries
              (no injection risk), JWT-based authentication with short expiry, and structured audit
              logging. To report a security vulnerability, see{" "}
              <a
                href="/.well-known/security.txt"
                className="text-indigo-600 hover:underline"
              >
                /.well-known/security.txt
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Children&apos;s Privacy</h2>
            <p className="text-gray-600 leading-relaxed">
              NestFleet is not directed at children under 16. We do not knowingly collect personal
              data from children. If you believe we have inadvertently collected such data, please
              contact us immediately at{" "}
              <a href="mailto:privacy@nestfleet.dev" className="text-indigo-600 hover:underline">
                privacy@nestfleet.dev
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Changes to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              We will notify you of material changes to this Privacy Policy by email at least 14 days
              before they take effect. The &ldquo;last updated&rdquo; date at the top of this page always
              reflects the current version.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Contact & Complaints</h2>
            <p className="text-gray-600 leading-relaxed">
              For privacy enquiries: <a href="mailto:privacy@nestfleet.dev" className="text-indigo-600 hover:underline">privacy@nestfleet.dev</a>
              <br />
              If you are unsatisfied with our response, you have the right to lodge a complaint with
              your local data protection authority (e.g., the ICO in the UK, or your national DPA
              in the EU).
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-gray-100 mt-16 py-8 px-5 sm:px-8">
        <div className="mx-auto max-w-3xl flex flex-wrap gap-4 text-sm text-gray-400">
          <Link href="/" className="hover:text-gray-700 transition-colors">Home</Link>
          <Link href="/terms" className="hover:text-gray-700 transition-colors">Terms of Service</Link>
          <Link href="/signup" className="hover:text-gray-700 transition-colors">Sign up</Link>
          <Link href="/login" className="hover:text-gray-700 transition-colors">Sign in</Link>
          <a href="mailto:privacy@nestfleet.dev" className="hover:text-gray-700 transition-colors">privacy@nestfleet.dev</a>
        </div>
      </footer>
    </div>
  )
}
