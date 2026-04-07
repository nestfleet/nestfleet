import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service — NestFleet",
  description: "NestFleet Terms of Service.",
}

const LAST_UPDATED = "2026-04-07"

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Minimal nav */}
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white text-xs">⚡</span>
            <span className="font-bold text-gray-900 text-sm">NestFleet</span>
          </Link>
          <Link href="/privacy" className="text-sm text-indigo-600 hover:underline">
            Privacy Policy →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 sm:px-8 py-12">
        {/* Draft banner */}
        <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Draft document.</strong> This Terms of Service is a placeholder and is not yet legally binding.
          A finalised version will be published before paid plans are made available to users.
          Questions? Contact{" "}
          <a href="mailto:legal@nestfleet.dev" className="underline">legal@nestfleet.dev</a>.
        </div>

        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-gray prose-sm max-w-none space-y-8">

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              By accessing or using NestFleet (&ldquo;the Service&rdquo;), you agree to be bound by these
              Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, you may not use the
              Service. These Terms apply to all users, including self-hosted deployments and users of
              the managed SaaS offering at nestfleet.dev.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. Description of Service</h2>
            <p className="text-gray-600 leading-relaxed">
              NestFleet is an AI-native product operations platform that provides support case
              management, AI-assisted triage and replies, change request workflows, and knowledge base
              management for software products. The Service is offered in two forms:
            </p>
            <ul className="mt-3 space-y-2 text-gray-600 list-disc list-inside">
              <li>
                <strong>SaaS (nestfleet.dev):</strong> A managed hosted service operated by NestFleet.
              </li>
              <li>
                <strong>Self-Hosted (AGPL-3.0):</strong> Open-source software you may deploy on your
                own infrastructure under the terms of the GNU Affero General Public License v3.0.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. User Obligations</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              You agree to use the Service only for lawful purposes and in accordance with these Terms.
              You must not:
            </p>
            <ul className="space-y-2 text-gray-600 list-disc list-inside">
              <li>Use the Service to process data you do not have the right to process.</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure.</li>
              <li>Use the Service to send unsolicited communications or for any abusive purpose.</li>
              <li>Reverse-engineer or attempt to extract proprietary algorithms from the Service.</li>
              <li>Exceed usage limits associated with your plan tier.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Account Registration</h2>
            <p className="text-gray-600 leading-relaxed">
              To access the SaaS Service you must register an account. You are responsible for
              maintaining the confidentiality of your credentials and for all activity that occurs
              under your account. You must notify us immediately at{" "}
              <a href="mailto:security@nestfleet.dev" className="text-indigo-600 hover:underline">
                security@nestfleet.dev
              </a>{" "}
              if you suspect any unauthorised use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Intellectual Property</h2>
            <p className="text-gray-600 leading-relaxed">
              The NestFleet platform is licensed under the{" "}
              <a
                href="https://www.gnu.org/licenses/agpl-3.0.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                GNU Affero General Public License v3.0 (AGPL-3.0)
              </a>
              . Source code is available at{" "}
              <a
                href="https://github.com/nestfleet/nestfleet"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:underline"
              >
                github.com/nestfleet/nestfleet
              </a>
              . Your data remains yours — we do not claim ownership of content you input into the
              Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. LLM API Usage</h2>
            <p className="text-gray-600 leading-relaxed">
              The Service uses third-party LLM providers (such as OpenAI, Anthropic, and Google) via
              API keys you supply. By providing an API key, you acknowledge that your data will be
              sent to the respective provider subject to their own terms and privacy policies. NestFleet
              encrypts stored API keys at rest.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Subscription and Billing</h2>
            <p className="text-gray-600 leading-relaxed">
              Paid plans are processed through Stripe. By subscribing to a paid plan, you authorise
              recurring charges to your payment method. Subscription cancellation takes effect at the
              end of the current billing period. Refunds are handled at our discretion — contact{" "}
              <a href="mailto:billing@nestfleet.dev" className="text-indigo-600 hover:underline">
                billing@nestfleet.dev
              </a>{" "}
              for billing queries. Community tier features remain free with no time limit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Disclaimer of Warranties</h2>
            <p className="text-gray-600 leading-relaxed">
              The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind,
              express or implied. NestFleet does not warrant that the Service will be uninterrupted,
              error-free, or free of harmful components. AI-generated content (triage decisions,
              auto-replies, PR drafts) is provided for informational purposes only and requires human
              review before acting upon it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed">
              To the maximum extent permitted by applicable law, NestFleet shall not be liable for
              any indirect, incidental, special, consequential, or punitive damages, or any loss of
              profits or revenues, whether incurred directly or indirectly, or any loss of data, use,
              goodwill, or other intangible losses resulting from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Data Processing</h2>
            <p className="text-gray-600 leading-relaxed">
              Our data practices are described in the{" "}
              <Link href="/privacy" className="text-indigo-600 hover:underline">
                Privacy Policy
              </Link>
              . If you use the SaaS Service to process personal data on behalf of your customers,
              a Data Processing Agreement (DPA) will be made available. Contact{" "}
              <a href="mailto:legal@nestfleet.dev" className="text-indigo-600 hover:underline">
                legal@nestfleet.dev
              </a>{" "}
              to request a DPA.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">11. Termination</h2>
            <p className="text-gray-600 leading-relaxed">
              We reserve the right to suspend or terminate your access to the Service for violation
              of these Terms, with or without notice. Upon termination, your right to use the Service
              ceases immediately. Data export requests can be submitted to{" "}
              <a href="mailto:privacy@nestfleet.dev" className="text-indigo-600 hover:underline">
                privacy@nestfleet.dev
              </a>{" "}
              within 30 days of termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">12. Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update these Terms from time to time. We will notify registered users of material
              changes via email at least 14 days before they take effect. Continued use of the Service
              after changes take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">13. Governing Law</h2>
            <p className="text-gray-600 leading-relaxed">
              These Terms are governed by the laws of the jurisdiction in which NestFleet is
              incorporated (to be specified upon legal entity registration). Any disputes arising
              from these Terms shall be subject to the exclusive jurisdiction of the courts of that
              jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">14. Contact</h2>
            <p className="text-gray-600 leading-relaxed">
              For questions about these Terms, contact us at{" "}
              <a href="mailto:legal@nestfleet.dev" className="text-indigo-600 hover:underline">
                legal@nestfleet.dev
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-gray-100 mt-16 py-8 px-5 sm:px-8">
        <div className="mx-auto max-w-3xl flex flex-wrap gap-4 text-sm text-gray-400">
          <Link href="/" className="hover:text-gray-700 transition-colors">Home</Link>
          <Link href="/privacy" className="hover:text-gray-700 transition-colors">Privacy Policy</Link>
          <Link href="/signup" className="hover:text-gray-700 transition-colors">Sign up</Link>
          <Link href="/login" className="hover:text-gray-700 transition-colors">Sign in</Link>
          <a href="mailto:legal@nestfleet.dev" className="hover:text-gray-700 transition-colors">legal@nestfleet.dev</a>
        </div>
      </footer>
    </div>
  )
}
