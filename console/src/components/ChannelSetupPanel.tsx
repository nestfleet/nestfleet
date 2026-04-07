"use client";

/**
 * ChannelSetupPanel — right-side slide-over panel with channel setup instructions.
 *
 * Usage:
 *   <ChannelSetupPanel
 *     channelId={selectedChannelId}   // null = panel closed
 *     onClose={() => setSelectedChannelId(null)}
 *     productId={productId}
 *   />
 */

import { useState, useEffect } from "react";
import { CHANNEL_CATALOG } from "@/lib/channel-catalog";
import { useProductSafe } from "@/lib/product-context";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChannelSetupPanelProps {
  channelId: string | null;
  onClose:   () => void;
  productId: string;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors shrink-0"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ─── Inline code row with copy ────────────────────────────────────────────────

function CodeRow({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 break-all">
      <span className="flex-1">{value}</span>
      <CopyButton text={value} />
    </div>
  );
}

// ─── Internal link helper ─────────────────────────────────────────────────────

function SettingsLink({ slug, section, label }: { slug: string | null; section: string; label: string }) {
  if (!slug) {
    return <span className="text-indigo-600 text-sm">{label}</span>;
  }
  return (
    <a
      href={`/p/${slug}/settings?section=${section}`}
      className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm"
    >
      {label}
    </a>
  );
}

// ─── Step heading ─────────────────────────────────────────────────────────────

function StepHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
      {children}
    </h4>
  );
}

function StepBlock({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 pb-5 border-b border-gray-100 last:border-0 last:pb-0">{children}</div>;
}

// ─── Per-channel content ──────────────────────────────────────────────────────

function ChannelContent({
  channelId,
  productId,
  slug,
}: {
  channelId: string;
  productId: string;
  slug: string | null;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.nestfleet.io";

  switch (channelId) {
    case "email":
      return (
        <StepBlock>
          <StepHeading>Step 1 — Your inbound address</StepHeading>
          <p className="text-sm text-gray-600">
            Auto-provisioned. Use this address to receive support emails:
          </p>
          <CodeRow value={`${productId}@in.nestfleet.io`} />
          <p className="text-sm text-gray-500">
            Set up forwarding from your support inbox to this address.
          </p>
        </StepBlock>
      );

    case "github":
      return (
        <div className="flex flex-col gap-5">
          <StepBlock>
            <StepHeading>Step 1 — Add webhook to your GitHub repo</StepHeading>
            <p className="text-sm text-gray-600">
              Settings → Webhooks → Add webhook
            </p>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Payload URL</span>
              <CodeRow value={`${origin}/webhooks/github/events/${productId}`} />
            </div>
            <div className="text-sm text-gray-600 space-y-0.5">
              <p>Content type: <code className="text-xs bg-gray-100 rounded px-1 py-0.5">application/json</code></p>
              <p>Events: <span className="text-gray-700">&#10003; Issues, &#10003; Pull requests</span></p>
            </div>
          </StepBlock>
          <StepBlock>
            <StepHeading>Step 2 — Configure</StepHeading>
            <p className="text-sm text-gray-600">
              Repository (owner/repo) and GitHub PAT:
            </p>
            <SettingsLink slug={slug} section="ci" label="Settings → CI Integration" />
          </StepBlock>
        </div>
      );

    case "chat":
      return (
        <StepBlock>
          <StepHeading>Step 1 — Add to your app</StepHeading>
          <p className="text-sm text-gray-600">
            Navigate to Settings → Chat Widget for the embed snippet and public key.
          </p>
          <SettingsLink slug={slug} section="chat-widget" label="Settings → Chat Widget" />
        </StepBlock>
      );

    case "contact_form":
      return (
        <StepBlock>
          <StepHeading>Step 1 — Get your public key</StepHeading>
          <p className="text-sm text-gray-600">
            Navigate to Settings → Contact Form to copy your public key and embed snippet.
          </p>
          <SettingsLink slug={slug} section="contact-form" label="Settings → Contact Form" />
        </StepBlock>
      );

    case "slack":
      return (
        <div className="flex flex-col gap-5">
          <StepBlock>
            <StepHeading>Step 1 — Create an Incoming Webhook in Slack</StepHeading>
            <p className="text-sm text-gray-600">
              Apps → Incoming Webhooks → Add to Slack → choose your alert channel.
            </p>
          </StepBlock>
          <StepBlock>
            <StepHeading>Step 2 — Paste the URL in Settings</StepHeading>
            <p className="text-sm text-gray-600">Add the webhook URL in the Notifications section:</p>
            <SettingsLink slug={slug} section="notifications" label="Settings → Notifications" />
          </StepBlock>
        </div>
      );

    case "telegram":
      return (
        <div className="flex flex-col gap-5">
          <StepBlock>
            <StepHeading>Step 1 — Create a bot</StepHeading>
            <p className="text-sm text-gray-600">
              Message <code className="text-xs bg-gray-100 rounded px-1 py-0.5">@BotFather</code> in
              Telegram → <code className="text-xs bg-gray-100 rounded px-1 py-0.5">/newbot</code> →
              copy the token.
            </p>
          </StepBlock>
          <StepBlock>
            <StepHeading>Step 2 — Add token in Settings</StepHeading>
            <p className="text-sm text-gray-600">Paste the token in the Notifications section:</p>
            <SettingsLink slug={slug} section="notifications" label="Settings → Notifications" />
          </StepBlock>
        </div>
      );

    case "external":
      return (
        <div className="flex flex-col gap-5">
          <StepBlock>
            <StepHeading>Step 1 — Set your API key in product support policy</StepHeading>
            <p className="text-sm text-gray-600">
              Contact your NestFleet admin to set{" "}
              <code className="text-xs bg-gray-100 rounded px-1 py-0.5">externalWebhookApiKey</code>{" "}
              in <code className="text-xs bg-gray-100 rounded px-1 py-0.5">support_policy</code>.
            </p>
          </StepBlock>
          <StepBlock>
            <StepHeading>Step 2 — POST to the webhook endpoint</StepHeading>
            <CodeRow value={`POST /webhooks/external/${productId}`} />
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <span className="font-medium">Authorization:</span>{" "}
                <code className="text-xs bg-gray-100 rounded px-1 py-0.5">Bearer &lt;your-api-key&gt;</code>
              </p>
              <p className="font-medium">Body:</p>
              <pre className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 overflow-x-auto">
{`{
  threadId,
  senderName,
  senderRef,
  message,
  channelContext?
}`}
              </pre>
            </div>
          </StepBlock>
        </div>
      );

    default:
      return (
        <p className="text-sm text-gray-500">
          Configuration not available in this version.
        </p>
      );
  }
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ChannelSetupPanel({ channelId, onClose, productId }: ChannelSetupPanelProps) {
  const productCtx = useProductSafe();
  const slug = productCtx?.product.slug ?? null;

  const isOpen = channelId !== null;
  const channel = channelId
    ? CHANNEL_CATALOG.find((c) => c.id === channelId) ?? null
    : null;

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Prevent body scroll while panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={channel ? `${channel.name} setup` : "Channel setup"}
        className={[
          "fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col",
          "transition-transform duration-300",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 shrink-0">
          {channel && (
            <span className="text-2xl" role="img" aria-label={channel.name}>
              {channel.icon}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 truncate">
              {channel ? channel.name : "Channel Setup"}
            </h2>
            {channel && (
              <p className="text-xs text-gray-400 truncate">{channel.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto shrink-0 rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close panel"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {channelId && (
            <ChannelContent
              channelId={channelId}
              productId={productId}
              slug={slug}
            />
          )}
        </div>
      </div>
    </>
  );
}
