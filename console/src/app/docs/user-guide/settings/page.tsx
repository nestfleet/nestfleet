import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Settings & LLM Config — NestFleet Docs",
  description: "Configure products, LLM providers, channels, triage, and team members in NestFleet.",
}

export default function SettingsPage() {
  return (
    <DocsLayout
      prev={{ label: "Notifications", href: "/docs/user-guide/notifications" }}
      next={{ label: "Architecture", href: "/docs/developer/architecture" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Settings & LLM Config
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        The Settings section of the NestFleet console is where Admins configure products, connect
        channels, tune triage behaviour, manage team members, and set up the LLM provider. Most
        settings are scoped to a specific product; some (like user management and system-wide LLM defaults)
        are global.
      </p>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          Only users with the <strong>Admin</strong> role can access Settings. Other roles can view
          their own profile and notification preferences but cannot modify product or system settings.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Product settings</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Navigate to <strong>Settings → Products → [Product Name] → General</strong> to configure:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Product name</strong> — displayed in the console header and in notifications</li>
        <li><strong>Description</strong> — a brief description of the product passed to the triage agent as context. A clear, accurate description improves triage quality.</li>
        <li><strong>Timezone</strong> — used for scheduled notifications (daily digest) and display of case timestamps</li>
        <li><strong>Reply style</strong> — tone guidance for auto-reply generation (formal, casual, concise, detailed). This is injected into the auto-reply system prompt.</li>
        <li><strong>Support email address</strong> — the inbound email address customers use to submit cases (if email is configured as a channel)</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">LLM provider setup</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        NestFleet supports per-product LLM configuration. The product-level settings override the
        system-wide defaults set via environment variables. This allows you to use different
        providers or models for different products (e.g. GPT-4o for your enterprise product,
        Claude Haiku for a high-volume free tier).
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Navigate to <strong>Settings → Products → [Product Name] → LLM</strong> to configure:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Provider</strong> — openai, anthropic, ollama, or google</li>
        <li><strong>API key</strong> — stored encrypted at rest using AES-256-GCM (see <a href="/docs/self-hosting/environment" className="text-indigo-600 hover:underline">ENCRYPTION_KEY</a>)</li>
        <li><strong>Model</strong> — the model name for standard tasks (auto-reply, knowledge capture)</li>
        <li><strong>Fast model</strong> — override for triage and known-issue matching (optional)</li>
        <li><strong>Complex model</strong> — override for change preparation and PR drafting (optional)</li>
      </ul>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          The API key field is disabled (read-only) after saving to prevent browser autofill from
          overwriting it accidentally. Click <strong>Change key</strong> to enter a new value.
          The stored value is never returned to the browser — the field shows only a masked placeholder.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Channel configuration</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Channels are the inbound sources from which NestFleet receives cases. Configure them at
        <strong> Settings → Products → [Product Name] → Channels</strong>.
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700 w-[120px]">Channel</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">What to configure</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Email", "Inbound email address (or catch-all forwarding), SMTP backend (set globally via env vars). Specify which email domains to accept from."],
            ["GitHub", "Which repositories to listen to, the installed GitHub App, and which event types to ingest (issues, issue comments, pull request reviews)."],
            ["Telegram", "The Telegram bot token (set globally), and the specific Telegram group or channel to monitor for incoming user messages."],
            ["Webhook", "A signed inbound webhook URL for custom integrations. Copy the secret and configure it in your sending system."],
          ].map(([channel, config]) => (
            <tr key={channel}>
              <td className="px-3 py-2 border border-gray-200 align-top font-semibold text-gray-800">{channel}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{config}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Triage settings</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Navigate to <strong>Settings → Products → [Product Name] → Triage</strong> to configure how
        the triage agent behaves for this product:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>
          <strong>Confidence threshold</strong> — the minimum confidence score (0.0–1.0) required for
          auto-reply to trigger. Default: 0.80. See <a href="/docs/user-guide/auto-reply" className="text-indigo-600 hover:underline">AI Auto-Reply</a> for guidance on tuning this.
        </li>
        <li>
          <strong>Auto-reply mode</strong> — Auto-send or Send for approval. Default: Send for approval.
        </li>
        <li>
          <strong>Severity policy</strong> — override the default P0/P1 escalation behaviour. For example,
          you can configure a product so that all <code className="bg-gray-100 px-1 rounded text-xs">outage</code>-type
          cases are always P0 regardless of confidence.
        </li>
        <li>
          <strong>Novel bug threshold</strong> — the minimum knowledge-base similarity score below which
          a bug case is considered novel and a change request is automatically created. Default: 0.70.
        </li>
        <li>
          <strong>Auto-close spam</strong> — automatically close cases classified as{" "}
          <code className="bg-gray-100 px-1 rounded text-xs">spam</code> with high confidence. Default: off.
        </li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Team members</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Manage team members at <strong>Settings → Team Members</strong>. From this view, Admins can:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Invite a new user</strong> — sends a one-time signup link by email</li>
        <li><strong>Assign or change roles</strong> — select from the six built-in roles</li>
        <li><strong>Deactivate a user</strong> — prevents login without deleting the account or audit history</li>
        <li><strong>Reset a user&apos;s password</strong> — triggers a password reset email</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        See <a href="/docs/user-guide/roles" className="text-indigo-600 hover:underline">Roles & Permissions</a> for
        a full description of what each role can do.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Billing</h2>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          <strong>Self-hosted Community tier:</strong> NestFleet is free to self-host under AGPL-3.0 with no
          billing configuration required. The <strong>Settings → Billing</strong> section is visible but
          shows only a link to{" "}
          <a href="https://nestfleet.dev" className="text-indigo-700 font-medium hover:underline" target="_blank" rel="noopener noreferrer">nestfleet.dev</a>{" "}
          for information about paid license tiers that remove the &quot;Powered by NestFleet&quot; footer from
          auto-replies and unlock additional features.
        </p>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        If <code className="bg-gray-100 px-1 rounded text-xs">BILLING_ENABLED=true</code> is set (SaaS deployments only),
        the Billing section provides Stripe subscription management. Self-hosted operators should
        leave <code className="bg-gray-100 px-1 rounded text-xs">BILLING_ENABLED=false</code>.
      </p>
    </DocsLayout>
  )
}
