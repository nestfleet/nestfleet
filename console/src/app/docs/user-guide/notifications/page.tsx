import type { Metadata } from "next"
import { DocsLayout } from "@/components/docs/DocsLayout"

export const metadata: Metadata = {
  title: "Notifications — NestFleet Docs",
  description: "Email, Telegram, and Slack notification configuration in NestFleet.",
}

export default function NotificationsPage() {
  return (
    <DocsLayout
      prev={{ label: "Roles & Permissions", href: "/docs/user-guide/roles" }}
      next={{ label: "Settings & LLM Config", href: "/docs/user-guide/settings" }}
    >
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Notifications
      </h1>
      <p className="text-gray-600 leading-relaxed mb-6 text-base">
        NestFleet sends notifications through email, Telegram, and Slack (coming soon) to keep your
        team informed about critical events without requiring constant monitoring of the console.
        Each channel is configured at the system level; individual users can then adjust their
        personal preferences.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Email notifications</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Email is the primary notification channel. NestFleet sends transactional emails for the
        following events:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Event</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Recipients</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["Case assigned to you", "The assignee"],
            ["Case escalated to you", "The target Support Lead or Change Lead"],
            ["Auto-reply sent (auto-send mode)", "The case assignee and all Support Leads for the product"],
            ["Auto-reply pending your approval", "All Support Leads for the product"],
            ["Change request created (awaiting approval)", "All Change Leads for the product"],
            ["Change request approved", "The CR creator and the case assignee"],
            ["Change request rejected", "The CR creator and the case assignee"],
            ["Team invitation", "The invited user"],
            ["Password reset", "The requesting user"],
          ].map(([event, recipients]) => (
            <tr key={event}>
              <td className="px-3 py-2 border border-gray-200 text-gray-700 align-top font-medium">{event}</td>
              <td className="px-3 py-2 border border-gray-200 text-gray-600 align-top">{recipients}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Email notifications require a configured email backend. Set one of the following in your{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">.env</code>:
        <code className="bg-gray-100 px-1 rounded text-xs ml-2">SMTP_HOST</code>,
        <code className="bg-gray-100 px-1 rounded text-xs ml-2">POSTMARK_API_KEY</code>, or
        <code className="bg-gray-100 px-1 rounded text-xs ml-2">RESEND_API_KEY</code>.
        See the <a href="/docs/self-hosting/environment" className="text-indigo-600 hover:underline">Environment Variables</a> reference.
        Without an email backend, no notifications are sent and a warning is logged at startup.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Telegram notifications</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Telegram is used for <strong>high-urgency team alerts</strong>, primarily P0 and P1 case notifications.
        These are sent to a configured team channel rather than individual users, making them suitable
        for on-call alerting.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Telegram alerts are sent for the following events:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>A new P0 or P1 case arrives (immediately after triage, not after full processing)</li>
        <li>A P0 or P1 case has been open in <code className="bg-gray-100 px-1 rounded text-xs">awaiting-lead</code> for more than 15 minutes without acknowledgement</li>
        <li>An outage-type case is detected regardless of severity</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        To enable Telegram alerts:
      </p>
      <ol className="list-decimal pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Create a Telegram bot via <a href="https://t.me/BotFather" className="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">@BotFather</a> and copy the bot token</li>
        <li>Set <code className="bg-gray-100 px-1 rounded text-xs">TELEGRAM_BOT_TOKEN</code> in your <code className="bg-gray-100 px-1 rounded text-xs">.env</code></li>
        <li>Add the bot to your team Telegram group or channel</li>
        <li>Configure the target chat ID in <strong>Settings → Channels → Telegram → Alert Channel</strong></li>
      </ol>
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 mb-6">
        <p className="text-sm text-indigo-900 leading-relaxed">
          To find your Telegram chat ID, send a message to the group and call the Telegram Bot API:{" "}
          <code className="bg-indigo-100 px-1 rounded text-xs">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>.
          The chat ID appears in the response as <code className="bg-indigo-100 px-1 rounded text-xs">message.chat.id</code>.
          Group chat IDs are negative numbers (e.g. <code className="bg-indigo-100 px-1 rounded text-xs">-1001234567890</code>).
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Slack notifications</h2>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
        <p className="text-sm text-amber-900 leading-relaxed">
          <strong>Coming soon.</strong> Slack integration is planned for an upcoming release. The{" "}
          <code className="bg-amber-100 px-1 rounded text-xs">SLACK_WEBHOOK_URL</code> and{" "}
          <code className="bg-amber-100 px-1 rounded text-xs">SLACK_BOT_TOKEN</code> environment variables
          are already defined in the schema in preparation. Follow the{" "}
          <a href="https://github.com/nestfleet/nestfleet/releases" className="text-amber-800 font-medium hover:underline" target="_blank" rel="noopener noreferrer">release notes</a> for updates.
        </p>
      </div>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        When Slack integration is released, it will support:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Webhook-based channel alerts for P0/P1 cases (similar to Telegram alerts)</li>
        <li>Per-product Slack channel configuration</li>
        <li>Interactive message actions (acknowledge, assign) directly from Slack</li>
      </ul>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Per-user notification preferences</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Each user can customise which email notifications they receive from their profile settings.
        Navigate to the user avatar menu (top right of the console) → <strong>Notification preferences</strong>.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Available preferences:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li><strong>Case assigned to me</strong> — on by default</li>
        <li><strong>Case escalated to me</strong> — on by default</li>
        <li><strong>Auto-reply pending my approval</strong> — on by default for Support Leads</li>
        <li><strong>Change request pending my approval</strong> — on by default for Change Leads</li>
        <li><strong>Change request decision (approved/rejected)</strong> — on by default</li>
        <li><strong>Daily digest</strong> — off by default; sends a summary of open cases at 08:00 local time</li>
      </ul>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        Preferences are stored per-user and do not affect other team members. Admins cannot override
        individual user preferences, but they can configure product-level defaults in
        <strong> Settings → Notifications → Default preferences</strong>.
      </p>

      <h2 className="text-xl font-bold text-gray-900 mt-8 mb-3">Troubleshooting email delivery</h2>
      <p className="text-gray-600 leading-relaxed mb-4 text-sm">
        If notifications are not arriving, check the following:
      </p>
      <ul className="list-disc pl-6 text-gray-600 space-y-1 mb-4 text-sm leading-relaxed">
        <li>Confirm an email backend is configured (check for a startup warning in API logs)</li>
        <li>Verify the <code className="bg-gray-100 px-1 rounded text-xs">SMTP_FROM</code> address is authorised by your email provider (SPF/DKIM)</li>
        <li>Check the API logs for <code className="bg-gray-100 px-1 rounded text-xs">email.send.error</code> events</li>
        <li>For Postmark: check the Postmark dashboard for bounce or spam block events</li>
        <li>For Resend: check the Resend dashboard for delivery status and error codes</li>
      </ul>
    </DocsLayout>
  )
}
