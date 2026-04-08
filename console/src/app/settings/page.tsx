"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { AppLayout } from "@/components/AppLayout";
import {
  getSettingsApi,
  updateSettingsApi,
  getProductsApi,
  updateProductApi,
  testLlmApi,
  testSlackApi,
  generateContactFormKeyApi,
  generateChatKeyApi,
  listModelsApi,
  listUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  resetPasswordApi,
  getLicenseStatusApi,
  getRolesApi,
  getRolePermissionsApi,
  createCustomRoleApi,
  updateRolePermissionsApi,
  deleteCustomRoleApi,
  updateCustomRoleApi,
  createSsoMappingApi,
  exportRolesApi,
  getBillingStatusApi,
  billingCheckoutApi,
  billingPortalApi,
  type BillingStatus,
  type PlanInterval,
  type SettingsResponse,
  type TestLlmResult,
  type RoleSummary,
  type PermissionWithGrant,
} from "@/lib/api";
import type { OperatorUser, LicenseStatus } from "@/lib/types";
import { useLicense } from "@/lib/useLicense";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { useProductIdWithFallback, useProductSafe, useRefreshProducts } from "@/lib/product-context";
import { ChannelsHub } from "@/components/ChannelsHub";

const SECTIONS = [
  { key: "product", label: "Product", adminOnly: false, icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  { key: "llm", label: "LLM Provider", adminOnly: false, icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" },
  { key: "leads", label: "Lead Assignments", adminOnly: false, icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
  { key: "agent", label: "Agent Behavior", adminOnly: false, icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" },
  { key: "notifications", label: "Notifications", adminOnly: false, icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" },
  { key: "channels", label: "Channels", adminOnly: false, icon: "M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" },
  { key: "ci", label: "CI Integration", adminOnly: false, icon: "M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m0 0l4.5 7.795M12 12L7.5 4.205" },
  { key: "contact-form", label: "Contact Form", adminOnly: false, icon: "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" },
  { key: "chat", label: "Chat Widget", adminOnly: false, icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" },
  { key: "roles", label: "Roles & Permissions", adminOnly: false, icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { key: "users", label: "Users", adminOnly: true, icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
  { key: "plan", label: "Plan & Billing", adminOnly: true, icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function AdminOnlyNotice() {
  return (
    <div className="text-center py-8 space-y-2">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="mx-auto h-8 w-8 text-gray-300">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
      <p className="text-sm font-medium text-gray-500">Admin access required</p>
      <p className="text-xs text-gray-400">This section is only available to administrators.</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();
  const productId = useProductIdWithFallback();
  const isAdmin = user?.roles?.includes("admin") ?? false;
  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<SectionKey>("llm");
  const [saving, setSaving] = useState(false);
  const [stripeReturn, setStripeReturn] = useState<"success" | "cancel" | null>(null);

  // Deep-link support: ?section=plan (or any valid section key)
  // Legacy redirects: ci/chat/contact-form → channels hub
  // Also detect Stripe redirect: ?stripe_return=success|cancel
  useEffect(() => {
    const s = searchParams.get("section");
    const legacyToChannels = ["ci", "chat", "contact-form"];
    if (s && legacyToChannels.includes(s)) {
      setActiveSection("channels");
    } else if (s && SECTIONS.some((sec) => sec.key === s)) {
      setActiveSection(s as SectionKey);
    }
    const sr = searchParams.get("stripe_return");
    if (sr === "success" || sr === "cancel") {
      setStripeReturn(sr);
      // Clean the query param from the URL without a full navigation
      const params = new URLSearchParams(searchParams.toString());
      params.delete("stripe_return");
      const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
      router.replace(newUrl);
    }
  }, [searchParams]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR(
    productId ? ["settings", productId] : null,
    () => getSettingsApi(productId),
  );

  const settings: SettingsResponse | null = data?.data ?? null;

  async function handleSave(section: string, body: Record<string, unknown>) {
    setSaving(true);
    setSaveMsg(null);
    try {
      await updateSettingsApi(productId, { [section]: body });
      await mutate(["settings", productId]);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (err) {
      setSaveMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500">Product configuration</p>
        </div>

        {/* Save toast */}
        {saveMsg && (
          <div className={`text-xs px-3 py-1.5 rounded-lg ${saveMsg === "Saved" ? "bg-green-50 text-green-700 ring-1 ring-green-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
            {saveMsg}
          </div>
        )}

        {/* Two-column layout: vertical tabs | content */}
        <div className="flex gap-4">
          {/* Left: vertical tab nav */}
          <nav className="w-48 shrink-0 space-y-0.5" aria-label="Settings sections">
            {visibleSections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  activeSection === s.key
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <svg className={`h-4 w-4 shrink-0 ${activeSection === s.key ? "text-indigo-500" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                </svg>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>

          {/* Right: content panel */}
          <div className="flex-1 min-w-0 max-w-2xl">
            <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-5">
              {/* Product section reads from context — independent of settings API */}
              {/* Plan section fetches its own data — independent of product settings API */}
              {activeSection === "product" ? (
                <ProductSection />
              ) : activeSection === "plan" ? (
                isAdmin ? <LicenseSection stripeReturn={stripeReturn} onStripeReturnHandled={() => setStripeReturn(null)} /> : <AdminOnlyNotice />
              ) : isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                </div>
              ) : error ? (
                <p className="text-sm text-red-600">Failed to load settings: {(error as Error).message}</p>
              ) : settings ? (
                <>
                  {activeSection === "channels" && (
                    <>
                      <SectionHeader title="Channels" description="Manage inbound and outbound channel integrations for this product." />
                      <ChannelsHub productId={productId} />
                    </>
                  )}
                  {activeSection === "llm" && <LlmSection key={productId} settings={settings} onSave={handleSave} saving={saving} />}
                  {activeSection === "leads" && <LeadsSection key={productId} settings={settings} onSave={handleSave} saving={saving} />}
                  {activeSection === "agent" && <AgentSection key={productId} settings={settings} onSave={handleSave} saving={saving} />}
                  {activeSection === "notifications" && <NotificationsSection key={productId} settings={settings} onSave={handleSave} saving={saving} />}
                  {activeSection === "ci" && <CiSection key={productId} settings={settings} onSave={handleSave} saving={saving} />}
                  {activeSection === "contact-form" && <ContactFormSection key={productId} settings={settings} />}
                  {activeSection === "chat" && <ChatWidgetSection key={productId} settings={settings} />}
                  {activeSection === "roles" && <RolesSection />}
                  {activeSection === "users" && (isAdmin ? <UsersSection /> : <AdminOnlyNotice />)}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4 pb-3 border-b border-gray-100">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </div>
  );
}

function SaveButton({ onClick, saving, disabled }: { onClick: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving || disabled}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
    >
      {saving ? "Saving..." : "Save"}
    </button>
  );
}

// ── Product Section ───────────────────────────────────────────────────────────

const ACCENT_SWATCHES = [
  { hex: "#6366f1", label: "Indigo"  },
  { hex: "#3b82f6", label: "Blue"    },
  { hex: "#06b6d4", label: "Cyan"    },
  { hex: "#10b981", label: "Emerald" },
  { hex: "#f59e0b", label: "Amber"   },
  { hex: "#f43f5e", label: "Rose"    },
  { hex: "#a855f7", label: "Purple"  },
  { hex: "#64748b", label: "Slate"   },
] as const;

const PRODUCT_STAGES = [
  { value: "pre-launch",  label: "Pre-launch",  description: "Still building — internal testing only" },
  { value: "beta",        label: "Beta",         description: "Early adopters, limited rollout"        },
  { value: "production",  label: "Production",   description: "Fully live, all users"                  },
  { value: "deprecated",  label: "Deprecated",   description: "Retired — no new cases accepted"        },
] as const;

function ProductSection() {
  const productCtx  = useProductSafe();
  const refresh     = useRefreshProducts();
  const { toast } = useToast();
  const [saving,    setSaving]    = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [copied,    setCopied]    = useState(false);

  // When outside ProductProvider (no /p/[slug] route), load via API fallback
  const { data: productsData } = useSWR(
    productCtx ? null : "products-fallback",
    () => getProductsApi(),
  );
  const product = productCtx?.product ?? productsData?.products?.[0];

  const [name,        setName]        = useState(product?.name        ?? "");
  const [stage,       setStage]       = useState(product?.stage       ?? "production");
  const [accentColor, setAccentColor] = useState(product?.accentColor ?? "#6366f1");

  // Sync form if product changes (e.g. after refresh)
  useEffect(() => {
    if (product) {
      setName(product.name);
      setStage(product.stage);
      setAccentColor(product.accentColor ?? "#6366f1");
    }
  }, [product?.productId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) return null;

  const isDirty =
    name.trim() !== product.name ||
    stage       !== product.stage ||
    accentColor !== (product.accentColor ?? "#6366f1");

  async function handleSave() {
    if (!product) return;
    setSaving(true);
    try {
      await updateProductApi(product.productId, {
        name:        name.trim(),
        stage,
        accentColor,
      });
      refresh();
      toast("Product updated", "success");
    } catch (err) {
      toast(`Failed to save: ${(err as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!product) return;
    setArchiving(true);
    try {
      await updateProductApi(product.productId, { stage: "deprecated" });
      refresh();
      setShowArchiveModal(false);
      toast("Product archived", "success");
    } catch (err) {
      toast(`Failed to archive: ${(err as Error).message}`, "error");
    } finally {
      setArchiving(false);
    }
  }

  function handleCopySlug() {
    navigator.clipboard.writeText(product!.slug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Product" description="Identity and appearance of this product in the Console." />

      {/* Name */}
      <div>
        <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 mb-1">
          Product name
        </label>
        <input
          id="product-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-gray-400">{name.trim().length}/60 · Changing the name does not change the URL slug.</p>
      </div>

      {/* Slug — read-only */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">URL slug</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-700 select-all">
            {product.slug}
          </code>
          <button
            onClick={handleCopySlug}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Set at creation — forms the URL path <code className="font-mono">/p/{product.slug}/…</code></p>
      </div>

      {/* Stage */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Launch stage</label>
        <div className="space-y-2">
          {PRODUCT_STAGES.map(({ value, label, description }) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                stage === value
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="product-stage"
                value={value}
                checked={stage === value}
                onChange={() => setStage(value)}
                className="mt-0.5 h-4 w-4 accent-indigo-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Accent color</label>
        <div className="flex items-center gap-2.5 flex-wrap">
          {ACCENT_SWATCHES.map(({ hex, label }) => (
            <button
              key={hex}
              title={label}
              onClick={() => setAccentColor(hex)}
              className={`h-7 w-7 rounded-full transition-all ${
                accentColor === hex
                  ? "ring-2 ring-offset-2 ring-gray-400 scale-110"
                  : "hover:scale-105"
              }`}
              style={{ backgroundColor: hex }}
              aria-label={label}
              aria-pressed={accentColor === hex}
            />
          ))}
          {/* Live preview strip */}
          <div
            className="ml-3 h-7 w-24 rounded-md border border-gray-200 transition-colors"
            style={{ backgroundColor: accentColor }}
            title="Preview"
          />
        </div>
        <p className="mt-1.5 text-xs text-gray-400">Used in the sidebar product indicator and badge.</p>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <SaveButton onClick={handleSave} saving={saving} disabled={!isDirty || !name.trim()} />
      </div>

      {/* Danger zone */}
      {product.stage !== "deprecated" && (
        <div className="mt-2 rounded-xl border border-red-100 bg-red-50/60 p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h3>
          <p className="text-xs text-red-600 mb-3">
            Archiving this product sets its stage to <strong>deprecated</strong>. Existing data is preserved but the agent will stop accepting new cases.
          </p>
          <button
            onClick={() => setShowArchiveModal(true)}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
          >
            Archive this product…
          </button>
        </div>
      )}

      {/* Archive confirm modal */}
      <Modal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        title="Archive product?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            <strong>{product.name}</strong> will be marked as <strong>deprecated</strong>.
            All existing cases, change requests, and knowledge assets are preserved.
            The agent will stop processing new signals for this product.
          </p>
          <p className="text-xs text-gray-500">You can restore it by changing the stage back to active in Settings.</p>
          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={() => setShowArchiveModal(false)}
              disabled={archiving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {archiving && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {archiving ? "Archiving…" : "Archive product"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── LLM Section ──────────────────────────────────────────────────────────────

type ConnectionState = "idle" | "testing" | "connected" | "failed";

const PROVIDER_CARDS = [
  { value: "openai", label: "OpenAI", desc: "GPT-4o, o3, o4-mini", icon: "O" },
  { value: "anthropic", label: "Anthropic", desc: "Claude Sonnet, Haiku, Opus", icon: "A" },
  { value: "google", label: "Google", desc: "Gemini 2.x, Flash, Pro", icon: "G" },
  { value: "azure-openai", label: "Azure OpenAI", desc: "Enterprise OpenAI hosting", icon: "Az" },
  { value: "self-hosted", label: "Self-Hosted", desc: "Ollama, vLLM, LiteLLM", icon: "S" },
] as const;

function LlmSection({
  settings,
  onSave,
  saving,
}: {
  settings: SettingsResponse;
  onSave: (section: string, body: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const productId = useProductIdWithFallback();
  const savedProvider = settings.llm.provider ?? "";
  const [provider, setProvider] = useState(savedProvider);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(settings.llm.baseUrl ?? "");

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    settings.llm.configured ? "connected" : "idle"
  );
  const [connectionMsg, setConnectionMsg] = useState(
    settings.llm.configured ? `Connected · ${settings.llm.model}` : ""
  );

  // Pre-seed with the saved model so the dropdown is visible before "Test Connection".
  // If already configured, we'll also silently refresh the full model list in the background.
  const [models, setModels] = useState<string[]>(
    settings.llm.configured && settings.llm.model ? [settings.llm.model] : []
  );
  const [model, setModel] = useState(settings.llm.model ?? "");

  const [embeddingModel, setEmbeddingModel] = useState(settings.llm.embeddingModel ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Lock the API key field when a saved key exists — prevents Chrome autofill from overwriting.
  // User must click "Change" to unlock the field for editing.
  const [keyLocked, setKeyLocked] = useState(!!(settings.llm.apiKeyLast4 && settings.llm.provider));

  const isSelfHosted = provider === "self-hosted";

  // When the provider changes: lock if switching back to saved provider (key exists), unlock otherwise
  useEffect(() => {
    if (provider === savedProvider && settings.llm.apiKeyLast4) {
      setKeyLocked(true);
      setApiKey("");
    } else {
      setKeyLocked(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // On mount, silently fetch the full model list when a key is already saved.
  // This populates the dropdown without requiring a manual "Test Connection" click.
  useEffect(() => {
    if (!settings.llm.configured || !settings.llm.provider || !settings.llm.apiKeyLast4) return;
    // Fire-and-forget — do not update connection state, just enrich the model list.
    listModelsApi(productId, { provider: settings.llm.provider }).then((res) => {
      if (res.data.models.length > 0) {
        setModels(res.data.models);
      }
    }).catch(() => {
      // Silently ignore — user can still manually click "Test Connection"
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Test Connection = validate key + fetch models in one action
  async function handleTestConnection() {
    if (!provider) return;
    setConnectionState("testing");
    setConnectionMsg("");
    setModels([]);

    try {
      // 1. Fetch models (validates the key implicitly)
      const modelsRes = await listModelsApi(productId, {
        provider,
        apiKey: apiKey || undefined,
        baseUrl: isSelfHosted ? (baseUrl || undefined) : undefined,
      });

      if (modelsRes.data.models.length > 0) {
        setModels(modelsRes.data.models);
        setConnectionState("connected");
        setConnectionMsg(`${modelsRes.data.models.length} models available`);
        // Auto-select first model if none selected
        if (!model) setModel(modelsRes.data.models[0]);
      } else {
        setConnectionState("connected");
        setConnectionMsg("Connected — no models returned. Type model name manually.");
      }
    } catch (err) {
      setConnectionState("failed");
      setConnectionMsg((err as Error).message?.slice(0, 120) ?? "Connection failed");
    }
  }

  const statusColor =
    connectionState === "connected" ? "text-green-600" :
    connectionState === "failed"    ? "text-red-600" :
    connectionState === "testing"   ? "text-amber-600" :
    "text-gray-400";

  const statusDot =
    connectionState === "connected" ? "bg-green-500" :
    connectionState === "failed"    ? "bg-red-500" :
    connectionState === "testing"   ? "bg-amber-400 animate-pulse" :
    "bg-gray-300";

  // Key indicator: show saved key only if current provider matches the saved provider
  const hasSavedKey = !!(settings.llm.apiKeyLast4 && provider === savedProvider);
  const hasAnyKey = !!(apiKey || (hasSavedKey && keyLocked));

  return (
    <div className="space-y-4">
      <SectionHeader
        title="LLM Provider"
        description="Select a provider, enter your API key, and test the connection to load available models."
      />

      {/* Provider cards */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Provider</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROVIDER_CARDS.map((p) => {
            const isActive = provider === p.value;
            return (
              <button
                key={p.value}
                onClick={() => {
                  setProvider(p.value);
                  setModels([]);
                  setModel("");
                  setConnectionState("idle");
                  setConnectionMsg("");
                }}
                className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all ${
                  isActive
                    ? "border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                  isActive ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {p.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">{p.label}</div>
                  <div className="text-[10px] text-gray-400 truncate">{p.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Self-hosted / Ollama capability warning */}
      {isSelfHosted && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div className="space-y-0.5">
            <p className="font-medium">Tool calling may not be available</p>
            <p className="text-amber-700">
              Knowledge-base lookups and multi-step agents require function calling support. Older or smaller models (Llama 3.0, Mistral 7B, etc.) may not support it — agents will still run but without RAG lookups. Use a tool-capable model such as <span className="font-mono">llama3.1</span>, <span className="font-mono">qwen2.5</span>, or <span className="font-mono">mistral-nemo</span> for full functionality.
            </p>
          </div>
        </div>
      )}

      {/* Config area — appears when provider is selected */}
      {provider && (
        <>
          {/* Base URL — self-hosted + azure */}
          {(isSelfHosted || provider === "azure-openai") && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {isSelfHosted ? "Endpoint URL" : "Azure Resource URL"}
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={isSelfHosted ? "http://localhost:11434" : "https://your-resource.openai.azure.com"}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}

          {/* API Key + Test Connection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              API Key
              {hasSavedKey && (
                <span className="text-green-600 font-normal ml-1">({settings.llm.apiKeyLast4})</span>
              )}
              {!hasSavedKey && provider !== savedProvider && provider !== "self-hosted" && (
                <span className="text-amber-600 font-normal ml-1">— no key for this provider</span>
              )}
              {isSelfHosted && <span className="text-gray-400 font-normal ml-1">(optional)</span>}
            </label>
            <div className="flex gap-2">
              {hasSavedKey && keyLocked ? (
                /* Locked state: show masked key, prevent any autofill */
                <div className="flex-1 flex items-center rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 select-none">
                  <span className="flex-1 font-mono tracking-widest">{settings.llm.apiKeyLast4}</span>
                  <button
                    type="button"
                    onClick={() => { setKeyLocked(false); setApiKey(""); }}
                    className="ml-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasSavedKey ? "Enter new key to replace saved key" : isSelfHosted ? "Leave empty for local" : "Paste your API key"}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              )}
              <button
                onClick={handleTestConnection}
                disabled={connectionState === "testing" || (!isSelfHosted && !hasAnyKey)}
                className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {connectionState === "testing" ? "Connecting..." : "Test Connection"}
              </button>
            </div>

            {/* Status */}
            {connectionMsg && (
              <div className={`flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1.5 rounded-md ${
                connectionState === "connected" ? "bg-green-50 text-green-700" :
                connectionState === "failed"    ? "bg-red-50 text-red-700" :
                "bg-amber-50 text-amber-700"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot}`} />
                {connectionMsg}
              </div>
            )}
          </div>

          {/* Model selector — appears after connection */}
          {(models.length > 0 || model) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Chat Model</label>
              {models.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">Select model...</option>
                  {models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Type model name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              )}
            </div>
          )}

          {/* Advanced: embedding */}
          <div className="pt-1">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600"
            >
              <svg className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              Embedding model
              {embeddingModel && <span className="text-gray-300 ml-1">({embeddingModel})</span>}
            </button>
            {showAdvanced && (
              <div className="mt-2 p-3 rounded-lg bg-gray-50 space-y-2">
                <p className="text-[10px] text-gray-400">For product memory semantic search. Auto-defaulted per provider.</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={embeddingModel}
                      onChange={(e) => setEmbeddingModel(e.target.value)}
                      placeholder="Auto-detected"
                      className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="w-20 text-center text-[10px] text-gray-400 pt-1.5">{settings.llm.embeddingDimensions}d</div>
                </div>
              </div>
            )}
          </div>

          {/* Save */}
          <div className="pt-2 border-t border-gray-100">
            <SaveButton
              saving={saving}
              disabled={!provider || !model}
              onClick={() => {
                const body: Record<string, unknown> = { provider, model };
                if (apiKey) body.apiKey = apiKey;
                if ((isSelfHosted || provider === "azure-openai") && baseUrl) body.baseUrl = baseUrl;
                if (embeddingModel) body.embeddingModel = embeddingModel;
                onSave("llm", body);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Leads Section ────────────────────────────────────────────────────────────

function LeadsSection({
  settings,
  onSave,
  saving,
}: {
  settings: SettingsResponse;
  onSave: (section: string, body: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [supportLead, setSupportLead] = useState(settings.leads.support_lead ?? "");
  const [changeLead, setChangeLead] = useState(settings.leads.change_lead ?? "");
  const [productLead, setProductLead] = useState(settings.leads.product_lead ?? "");
  const [knowledgeLead, setKnowledgeLead] = useState(settings.leads.knowledge_lead ?? "");

  const fields = [
    { label: "Support Lead", value: supportLead, setter: setSupportLead, key: "support_lead", desc: "Escalations, auto-reply review" },
    { label: "Change Lead", value: changeLead, setter: setChangeLead, key: "change_lead", desc: "CR approvals, PR draft review" },
    { label: "Product Lead", value: productLead, setter: setProductLead, key: "product_lead", desc: "Product decisions, outage coordination" },
    { label: "Knowledge Lead", value: knowledgeLead, setter: setKnowledgeLead, key: "knowledge_lead", desc: "Documentation, product memory" },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Lead Assignments"
        description="Map email addresses to lead roles. Notifications and approvals route here."
      />

      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="flex items-start gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-0.5">{f.label}</label>
              <input
                type="email"
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
                placeholder="lead@company.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-5 w-40 shrink-0 hidden lg:block">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-gray-100">
        <SaveButton
          saving={saving}
          onClick={() => onSave("leads", {
            support_lead: supportLead || undefined,
            change_lead: changeLead || undefined,
            product_lead: productLead || undefined,
            knowledge_lead: knowledgeLead || undefined,
          })}
        />
      </div>
    </div>
  );
}

// ── Agent Section ────────────────────────────────────────────────────────────

function AgentSection({
  settings,
  onSave,
  saving,
}: {
  settings: SettingsResponse;
  onSave: (section: string, body: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const [tone, setTone] = useState(settings.agent.tone ?? "formal");

  const tones = [
    { value: "formal", label: "Formal", desc: "Professional, structured — enterprise customers" },
    { value: "friendly", label: "Friendly", desc: "Warm, conversational — consumer products" },
    { value: "technical", label: "Technical", desc: "Precise, detail-oriented — developer tools" },
  ] as const;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Agent Behavior"
        description="Control how NestFleet agents communicate with end users."
      />

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Communication Tone</label>
        <div className="space-y-2">
          {tones.map((t) => (
            <label
              key={t.value}
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                tone === t.value
                  ? "border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-200"
                  : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="tone"
                value={t.value}
                checked={tone === t.value}
                onChange={() => setTone(t.value)}
                className="mt-0.5 h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">{t.label}</span>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <SaveButton saving={saving} onClick={() => onSave("agent", { tone })} />
      </div>
    </div>
  );
}

// ── Notifications Section ────────────────────────────────────────────────────

function NotificationsSection({
  settings,
  onSave,
  saving,
}: {
  settings: SettingsResponse;
  onSave: (section: string, body: Record<string, unknown>) => Promise<void>;
  saving: boolean;
}) {
  const productId = useProductIdWithFallback();
  const { toast: showToast } = useToast();
  const [start, setStart] = useState(settings.notifications.quietHoursStart ?? "20:00");
  const [end, setEnd] = useState(settings.notifications.quietHoursEnd ?? "08:00");
  const [weekendSupp, setWeekendSupp] = useState(settings.notifications.weekendSuppression ?? true);

  // Slack channel config
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [testingSlack, setTestingSlack] = useState(false);
  const slackConfigured = settings.notifications.slackWebhookConfigured;
  const slackLast4 = settings.notifications.slackWebhookLast4;
  const telegramConfigured = settings.notifications.telegramConfigured;

  async function handleTestSlack() {
    setTestingSlack(true);
    try {
      // Save the URL first if a new one was entered
      if (slackWebhookUrl) {
        await onSave("notifications", { slackWebhookUrl });
      }
      const res = await testSlackApi(productId);
      if (res.ok) {
        showToast("Test message sent to Slack successfully.", "success");
      } else {
        showToast(res.error ?? "Slack test failed.", "error");
      }
    } catch {
      showToast("Could not reach the server. Try again.", "error");
    } finally {
      setTestingSlack(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Notification Channels ─────────────────────────────────────────── */}
      <div>
        <SectionHeader
          title="Notification Channels"
          description="Configure where operator alerts (approvals, escalations, outages) are delivered."
        />

        <div className="space-y-3 mt-3">
          {/* Email — always on */}
          <div className="rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-indigo-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Email</p>
                <p className="text-[11px] text-gray-500">Lead role email addresses from Lead Assignments</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          </div>

          {/* Slack */}
          <div className={`rounded-xl border p-4 space-y-3 ${slackConfigured ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#4A154B]/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#4A154B]">
                    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Slack</p>
                  <p className="text-[11px] text-gray-500">Incoming Webhook — alerts to your ops channel</p>
                </div>
              </div>
              {slackConfigured ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  Not configured
                </span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Incoming Webhook URL
                {slackConfigured && slackLast4 && (
                  <span className="ml-2 font-normal text-gray-400">saved (ends …{slackLast4}) — leave blank to keep</span>
                )}
                {slackConfigured && !slackLast4 && (
                  <span className="ml-2 font-normal text-gray-400">configured via environment variable</span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={slackWebhookUrl}
                  onChange={(e) => setSlackWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  onClick={handleTestSlack}
                  disabled={testingSlack}
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
                >
                  {testingSlack ? "Sending…" : "Test Connection"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Get this from your Slack workspace: Apps → Incoming Webhooks → Add new webhook.
                Clicking Test Connection saves any new URL first, then sends a test message.
              </p>
            </div>
          </div>

          {/* Telegram */}
          <div className={`rounded-xl border p-4 flex items-center justify-between ${telegramConfigured ? "border-sky-200 bg-sky-50/30" : "border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-sky-500">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Telegram</p>
                <p className="text-[11px] text-gray-500">
                  {telegramConfigured
                    ? "Bot token configured via TELEGRAM_BOT_TOKEN env var"
                    : "Set TELEGRAM_BOT_TOKEN environment variable to enable"}
                </p>
              </div>
            </div>
            {telegramConfigured ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full ring-1 ring-emerald-100">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                Not configured
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Notification Policy ───────────────────────────────────────────── */}
      <div className="pt-4 border-t border-gray-100">
        <SectionHeader
          title="Notification Policy"
          description="Quiet hours and weekend rules for non-critical notifications."
        />

        <div className="space-y-4 mt-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Quiet Hours</label>
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">From</label>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <span className="text-gray-300 mt-4">→</span>
              <div>
                <label className="block text-[10px] text-gray-500 mb-0.5">To</label>
                <input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={weekendSupp}
                onChange={(e) => setWeekendSupp(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
            </div>
            <div>
              <span className="text-sm text-gray-700">Weekend suppression</span>
              <p className="text-[10px] text-gray-400">Silence non-critical notifications on Sat/Sun</p>
            </div>
          </label>

          <p className="text-[10px] text-gray-400 bg-amber-50 rounded-lg px-3 py-2 ring-1 ring-amber-100">
            Critical notifications (outages, escalations) always break through — both quiet hours and weekends.
          </p>

          <div className="pt-2 border-t border-gray-100">
            <SaveButton
              saving={saving}
              onClick={() => onSave("notifications", {
                quietHoursStart: start,
                quietHoursEnd: end,
                weekendSuppression: weekendSupp,
                ...(slackWebhookUrl ? { slackWebhookUrl } : {}),
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CI Integration Section ──────────────────────────────────────────────────

function CiSection({
  settings,
  onSave,
  saving,
}: {
  settings: SettingsResponse;
  onSave: (section: string, body: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const ci = settings.ci;

  const [enabled, setEnabled] = useState(ci?.enabled ?? false);
  const [secret, setSecret] = useState("");
  const [autoComplete, setAutoComplete] = useState(ci?.autoCompleteOnCiPass ?? false);
  const [trackDeploys, setTrackDeploys] = useState(ci?.trackDeployments ?? false);
  const [githubPat, setGithubPat] = useState("");
  const [githubRepo, setGithubRepo] = useState(ci?.githubRepo ?? "");

  const webhookUrl = typeof window !== "undefined"
    ? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/v1/webhooks/github`
    : "";

  return (
    <div className="space-y-5">
      <SectionHeader
        title="CI Integration"
        description="Track PR merges, CI results, and deployments for change requests."
      />

      {/* Enable toggle */}
      <ToggleRow
        checked={enabled}
        onChange={setEnabled}
        label="Enable CI tracking"
        description="Listen for GitHub webhook events on PRs created by NestFleet"
      />

      {enabled && (
        <>
          {/* Webhook URL (read-only, copy) */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Webhook URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 font-mono"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="text-[10px] text-gray-400">
              Add this URL as a webhook in your GitHub repository settings. Select events: <code className="text-[10px]">Pull requests</code>, <code className="text-[10px]">Check suites</code>, <code className="text-[10px]">Deployment statuses</code>.
            </p>
          </div>

          {/* Webhook secret */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">
              Webhook Secret
              {ci?.webhookConfigured && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-green-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Configured
                </span>
              )}
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={ci?.webhookConfigured ? "••••••••  (enter new to replace)" : "Enter GitHub webhook secret"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[10px] text-gray-400">
              Set the same secret in GitHub → Webhooks → Secret. Used to verify webhook authenticity.
            </p>
          </div>

          {/* GitHub outbound — PAT */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">
              GitHub Personal Access Token
              {ci?.githubPatConfigured && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-green-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Configured
                </span>
              )}
            </label>
            <input
              type="password"
              value={githubPat}
              onChange={(e) => setGithubPat(e.target.value)}
              placeholder={ci?.githubPatConfigured ? "••••••••  (enter new to replace)" : "ghp_... or github_pat_..."}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[10px] text-gray-400">
              Required for NestFleet to create PRs and post comments on GitHub. Needs <code className="text-[10px]">repo</code> scope. Stored encrypted. Falls back to <code className="text-[10px]">GITHUB_TOKEN</code> env var if not set here.
            </p>
          </div>

          {/* GitHub outbound — target repo */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-gray-600">Target Repository</label>
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="text-[10px] text-gray-400">
              The GitHub repository where NestFleet will create issues and PR drafts (e.g. <code className="text-[10px]">acme/my-product</code>).
            </p>
          </div>

          {/* Auto-complete on CI pass */}
          <ToggleRow
            checked={autoComplete}
            onChange={setAutoComplete}
            label="Auto-complete CR on CI pass"
            description="When CI passes after PR merge, automatically mark the change request as completed and resolve the case"
          />

          {/* Track deployments */}
          <ToggleRow
            checked={trackDeploys}
            onChange={setTrackDeploys}
            label="Track deployments"
            description="Listen for deployment_status events and show deploy status in the lineage timeline"
          />

          {/* Info box */}
          <div className="text-[10px] text-gray-500 bg-blue-50 rounded-lg px-3 py-2 ring-1 ring-blue-100 space-y-1">
            <p className="font-medium text-blue-700">How it works</p>
            <p>When a NestFleet-authored PR is merged, the change request enters <code className="text-[10px]">ci-pending</code> state. On CI pass, it transitions to <code className="text-[10px]">ci-passed</code> (or auto-completes if enabled). On failure, the Change Lead is notified.</p>
          </div>
        </>
      )}

      <div className="pt-2 border-t border-gray-100">
        <SaveButton
          saving={saving}
          onClick={() => {
            const body: Record<string, unknown> = {
              enabled,
              auto_complete_on_ci_pass: autoComplete,
              track_deployments: trackDeploys,
            };
            // Only send secret/PAT if user entered a new value
            if (secret.trim()) body.github_webhook_secret = secret.trim();
            if (githubPat.trim()) body.github_pat = githubPat.trim();
            // Always send repo (allows clearing)
            if (githubRepo.trim() !== (ci?.githubRepo ?? "")) body.github_repo = githubRepo.trim();
            onSave("ci", body);
            setSecret("");
            setGithubPat("");
          }}
        />
      </div>
    </div>
  );
}

// ── Reusable toggle row ─────────────────────────────────────────────────────

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
      </div>
      <div>
        <span className="text-sm text-gray-700">{label}</span>
        <p className="text-[10px] text-gray-400">{description}</p>
      </div>
    </label>
  );
}

// ── Users Section ─────────────────────────────────────────────────────────────

const ROLE_OPTIONS = ["admin", "operator", "support_lead", "change_lead", "product_lead", "knowledge_lead"];
const ROLE_INFO: Record<string, { label: string; desc: string; access: string }> = {
  admin:          { label: "Administrator",  desc: "Full platform management",                     access: "All features + Users + License" },
  operator:       { label: "Operator",       desc: "Day-to-day console user",                      access: "Cases, PR Drafts, Notifications, Analytics, Settings (read)" },
  support_lead:   { label: "Support Lead",   desc: "Owns case lifecycle — triage, resolve",        access: "Cases (full), PR Drafts, Notifications" },
  change_lead:    { label: "Change Lead",    desc: "Reviews CRs, approves/rejects, completes PRs", access: "Cases, Queue, PR Drafts (complete), Notifications" },
  product_lead:   { label: "Product Lead",   desc: "Approves high-impact changes, sets priorities", access: "Cases, Queue, PR Drafts, Notifications" },
  knowledge_lead: { label: "Knowledge Lead", desc: "Manages product memory and knowledge base",    access: "Cases (read), Notifications, Memory" },
};

function roleBadgeClass(role: string): string {
  return role === "admin"
    ? "bg-slate-900 text-white"
    : "bg-gray-100 text-gray-600";
}

function userInitials(displayName: string | null | undefined, email: string): string {
  if (displayName?.trim()) {
    return displayName.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  }
  return email[0].toUpperCase();
}

function formatJoined(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function UsersSection() {
  const { toast } = useToast();
  const { data: users, mutate: refreshUsers } = useSWR("users-list", listUsersApi);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<OperatorUser | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRoles, setFormRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const openCreate = () => {
    setEditUser(null); setFormEmail(""); setFormDisplayName(""); setFormPassword(""); setFormRoles(["operator"]); setShowModal(true);
  };
  const openEdit = (u: OperatorUser) => {
    setEditUser(u); setFormEmail(u.email); setFormDisplayName(u.displayName ?? ""); setFormPassword(""); setFormRoles([...u.roles]); setShowModal(true);
  };

  const toggleRole = (role: string) => {
    setFormRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (editUser) {
        await updateUserApi(editUser.userId, {
          email: formEmail,
          displayName: formDisplayName || null,
          roles: formRoles,
        });
        toast("User updated", "success");
      } else {
        if (formPassword.length < 8) { toast("Password must be at least 8 characters", "error"); setSaving(false); return; }
        await createUserApi({ email: formEmail, displayName: formDisplayName || undefined, password: formPassword, roles: formRoles });
        toast("User created", "success");
      }
      setShowModal(false);
      refreshUsers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save user", "error");
    } finally { setSaving(false); }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm("Delete this user?")) return;
    setOpenMenuId(null);
    try {
      await deleteUserApi(userId);
      toast("User deleted", "success");
      refreshUsers();
    } catch { toast("Failed to delete user", "error"); }
  };

  const handleResetPassword = async (userId: string) => {
    setOpenMenuId(null);
    const pw = prompt("Enter new password (min 8 chars):");
    if (!pw || pw.length < 8) { toast("Password must be at least 8 characters", "error"); return; }
    try {
      await resetPasswordApi(userId, pw);
      toast("Password reset", "success");
    } catch { toast("Failed to reset password", "error"); }
  };

  const userList = (users as { data: OperatorUser[] } | undefined)?.data ?? [];

  return (
    <div className="space-y-4">
      {/* Overlay to close any open menu */}
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Users</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage operator accounts and role assignments.</p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Add user
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide">User</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide">Role</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wide">Joined</th>
              <th className="px-4 py-2.5 w-20 text-right text-[11px] font-medium text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {userList.map((u) => {
              const initials = userInitials(u.displayName, u.email);
              const primaryName = u.displayName?.trim() || u.email.split("@")[0];
              const visibleRoles = u.roles.slice(0, 2);
              const extraCount = u.roles.length - visibleRoles.length;
              const isMenuOpen = openMenuId === u.userId;

              return (
                <tr key={u.userId} className="hover:bg-gray-50/60 transition-colors">
                  {/* User */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 select-none">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-gray-900 truncate">{primaryName}</p>
                          {u.isSystem && (
                            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-500 uppercase tracking-wide leading-3">system</span>
                          )}
                        </div>
                        {u.displayName?.trim() && (
                          <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      {visibleRoles.map((r) => (
                        <span
                          key={r}
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium leading-4 ${roleBadgeClass(r)}`}
                        >
                          {ROLE_INFO[r]?.label ?? r}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="text-[10px] text-gray-400">+{extraCount}</span>
                      )}
                    </div>
                  </td>

                  {/* Joined */}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400">{formatJoined(u.createdAt)}</span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="relative flex justify-end">
                      {/* Edit (primary) + dropdown caret */}
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs divide-x divide-gray-200">
                        <button
                          onClick={() => { openEdit(u); setOpenMenuId(null); }}
                          className="px-2.5 py-1 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : u.userId); }}
                          className="px-1.5 py-1 text-gray-400 hover:bg-gray-50 transition-colors"
                          aria-label="More actions"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>

                      {/* Dropdown panel */}
                      {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg z-20 py-1 text-xs">
                          <button
                            onClick={() => { openEdit(u); setOpenMenuId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors text-left"
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                            </svg>
                            Edit user
                          </button>
                          <button
                            onClick={() => handleResetPassword(u.userId)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors text-left"
                          >
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                            </svg>
                            Reset password
                          </button>
                          {!u.isSystem && (
                            <>
                              <div className="my-1 border-t border-gray-100" />
                              <button
                                onClick={() => handleDelete(u.userId)}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 transition-colors text-left"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                Delete user
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {userList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-xs text-gray-400">
                  No users yet — add the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal isOpen={true} onClose={() => setShowModal(false)} title={editUser ? "Edit user" : "Add user"}>
          <div className="space-y-3">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Display name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Password (create only) */}
            {!editUser && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
              </div>
            )}

            {/* Roles */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Role</label>
              <div className="space-y-1.5">
                {ROLE_OPTIONS.map((role) => {
                  const info = ROLE_INFO[role];
                  const checked = formRoles.includes(role);
                  return (
                    <label
                      key={role}
                      className={`flex items-start gap-3 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                        checked ? "border-indigo-200 bg-indigo-50/40" : "border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(role)}
                        className="mt-0.5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-800">{info?.label ?? role}</span>
                          <code className="text-[10px] text-gray-400 font-mono">{role}</code>
                        </div>
                        {info && <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{info.desc}</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors"
              >
                {saving ? "Saving…" : editUser ? "Save changes" : "Add user"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── License Section ───────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  community: "bg-gray-100 text-gray-700",
  trial:     "bg-amber-100 text-amber-700",
  starter:   "bg-blue-100 text-blue-700",
  growth:    "bg-indigo-100 text-indigo-700",
  scale:     "bg-violet-100 text-violet-700",
};

// Kept for future use when billing self-service lands (BILLING_ENABLED gate).
interface PlanHighlight { label: string; note?: string }

const TIER_HIGHLIGHTS: Record<string, PlanHighlight[]> = {
  community: [
    { label: "Case Management, Signals & Approvals" },
    { label: "AI Auto-Reply", note: "human approval required before send" },
    { label: "AI Triage, Known-Issue Matching, Outage Routing" },
    { label: "Change Requests + AI PR Drafts" },
    { label: "Manual Knowledge Base" },
    { label: "Analytics: Overview Dashboard" },
    { label: "Compliance: basic reports" },
    { label: "Default roles + role assignment" },
    { label: "Settings, Audit Log, Products" },
  ],
  starter: [
    { label: "AI Auto-Reply: autonomous send", note: "no human approval required" },
    { label: "Analytics: Cost & Token Usage" },
    { label: "Channel: Website Widget" },
    { label: "Compliance: Basic Templates" },
    { label: "Products: up to 3" },
  ],
  growth: [
    { label: "Analytics: AI Performance, Case Analytics, Knowledge Health, Operations" },
    { label: "Channel: Slack" },
    { label: "CI Auto-Complete" },
    { label: "Auto Knowledge Capture" },
    { label: "Compliance: GDPR / AI Act Templates" },
    { label: "Products: up to 10" },
  ],
  scale: [
    { label: "Custom Roles + Permission Studio" },
    { label: "Per-User Permission Overrides" },
    { label: "SSO / SAML + Group → Role Mapping" },
    { label: "Channels: Discord, Internal API" },
    { label: "Custom Compliance Bundles" },
    { label: "Products: up to 999" },
  ],
};

const NEXT_TIER: Record<string, string> = {
  community: "starter",
  starter:   "growth",
  growth:    "scale",
};

const PLAN_OPTIONS = [
  {
    id: "STARTER" as const,
    label: "Starter",
    monthlyPrice: "$99",
    annuallyPrice: "$79",
    desc: "Up to 3 products, autonomous AI replies, cost analytics.",
  },
  {
    id: "GROWTH" as const,
    label: "Growth",
    monthlyPrice: "$499",
    annuallyPrice: "$399",
    desc: "Up to 10 products, full analytics suite, CI auto-complete, Slack.",
  },
];

interface LicenseSectionProps {
  stripeReturn: "success" | "cancel" | null;
  onStripeReturnHandled: () => void;
}

function LicenseSection({ stripeReturn, onStripeReturnHandled }: LicenseSectionProps) {
  const { license, tier, ouUsage } = useLicense();
  const { toast } = useToast();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingInterval, setBillingInterval] = useState<PlanInterval>("monthly");
  const stripeReturnHandledRef = useRef(false);

  const { data: billingData, mutate: mutateBilling, error: billingError } = useSWR(
    "billing-status",
    getBillingStatusApi,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const billing: BillingStatus | null = billingData?.data ?? null;
  // When BILLING_ENABLED=false the API returns 404 — billing self-service is not available.
  // Use direct status property check (more reliable than instanceof across Next.js chunks).
  // billingDisabled is only true once the error is confirmed; undefined = still loading.
  const billingDisabled = (billingError as { status?: number } | undefined)?.status === 404;

  useEffect(() => {
    if (!stripeReturn || stripeReturnHandledRef.current) return;
    stripeReturnHandledRef.current = true;
    if (stripeReturn === "success") {
      toast("Subscription activated! Refreshing billing status…", "success");
      void mutateBilling();
    } else {
      toast("Checkout cancelled.", "info");
    }
    onStripeReturnHandled();
  }, [stripeReturn]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan      = billing?.plan ?? "community";
  const isPaid    = plan === "starter" || plan === "growth" || plan === "scale";

  // Upgrade options: filter out plans the user is already on or above.
  // When billing is not active (BILLING_ENABLED=false on customer VPS), use the
  // license JWT tier as the effective rank so Starter installs only see Growth.
  const TIER_RANK: Record<string, number> = { community: 0, trial: 0, starter: 1, growth: 2, scale: 3 }
  const effectiveRank = TIER_RANK[isPaid ? plan : (tier ?? "community")] ?? 0
  const availableUpgrades = PLAN_OPTIONS.filter(
    (opt) => (TIER_RANK[opt.id.toLowerCase()] ?? 0) > effectiveRank,
  )
  const isCanceling = !!billing?.cancelAt;
  const productPct  = license ? Math.min(100, (license.currentProducts / Math.max(1, license.productLimit)) * 100) : 0;
  const tierColor   = TIER_COLORS[tier ?? "community"] ?? "bg-gray-100 text-gray-700";
  const tierLabel   = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "Community";

  async function handleCheckout(planId: "starter" | "growth", interval: PlanInterval) {
    setCheckoutLoading(`${planId}-${interval}`);
    try {
      const base = window.location.origin + window.location.pathname;
      const res = await billingCheckoutApi({
        plan: planId,
        interval,
        success_url: `${base}?section=plan&stripe_return=success`,
        cancel_url:  `${base}?section=plan&stripe_return=cancel`,
      });
      if (res.data?.checkout_url) window.location.href = res.data.checkout_url;
    } catch (err) {
      toast(`Checkout failed: ${(err as Error).message}`, "error");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const base = window.location.origin + window.location.pathname;
      const res = await billingPortalApi({ return_url: `${base}?section=plan` });
      if (res.data?.portal_url) window.location.href = res.data.portal_url;
    } catch (err) {
      toast(`Portal failed: ${(err as Error).message}`, "error");
    } finally {
      setPortalLoading(false);
    }
  }

  if (!license && !billing) {
    return <p className="text-sm text-gray-400">Loading billing information…</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Plan &amp; Billing</h2>
        <p className="text-xs text-gray-500">Current plan and usage.</p>
      </div>

      {/* Trial countdown */}
      {billing?.trialEndsAt && (() => {
        const days = Math.max(0, Math.ceil((new Date(billing.trialEndsAt!).getTime() - Date.now()) / 86_400_000));
        return (
          <div className={`rounded-lg border p-3 ${days <= 3 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-sm font-medium ${days <= 3 ? "text-red-700" : "text-amber-700"}`}>
              {days === 0 ? "Trial expires today." : `Trial ends in ${days} day${days === 1 ? "" : "s"}.`}
            </p>
          </div>
        );
      })()}

      {/* Cancellation banner */}
      {isCanceling && billing?.cancelAt && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
          <p className="text-sm font-medium text-orange-700">
            Subscription cancels on{" "}
            {new Date(billing.cancelAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.{" "}
            Use the customer portal to reactivate.
          </p>
        </div>
      )}

      {/* Plan status card */}
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tierColor}`}>
              {tierLabel}
            </span>
            {license?.expired && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                Expired
              </span>
            )}
            {billing?.planInterval && (
              <span className="text-xs text-gray-400 capitalize">{billing.planInterval}</span>
            )}
            {license?.customerName && (
              <span className="text-xs text-gray-500">{license.customerName}</span>
            )}
          </div>
          {billing?.currentPeriodEnd && (
            <span className="text-xs text-gray-400">
              Renews {new Date(billing.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>

        {/* Products usage */}
        {license && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Products</span>
              <span>{license.currentProducts} / {license.productLimit >= 999 ? "unlimited" : license.productLimit}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${productPct >= 90 ? "bg-red-500" : productPct >= 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                style={{ width: `${productPct}%` }}
              />
            </div>
          </div>
        )}

        {/* OU usage */}
        {ouUsage && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Outcome Units (this month)</span>
              <span>{ouUsage.usage.toLocaleString()} / {ouUsage.limit === 0 ? "unlimited" : ouUsage.limit.toLocaleString()}</span>
            </div>
            {ouUsage.limit > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full rounded-full transition-all ${ouUsage.percent >= 90 ? "bg-red-500" : ouUsage.percent >= 70 ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${Math.min(100, ouUsage.percent)}%` }}
                />
              </div>
            )}
          </div>
        )}

        {license?.expiresAt && (
          <p className="text-xs text-gray-400">
            License valid until{" "}
            {new Date(license.expiresAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
          </p>
        )}
      </div>

      {/* Branch A: Community self-hoster — no billing, no license tier.
          Direct them to nestfleet.dev to upgrade to managed SaaS. */}
      {billingDisabled && (!tier || tier === "community") && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Community Plan</p>
          <p className="text-xs text-gray-500">
            You&apos;re running NestFleet Community — free forever, self-hosted, AGPL open source.
          </p>
          <a
            href="https://nestfleet.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Upgrade to managed SaaS →
          </a>
          <p className="text-xs text-gray-400">
            Managed hosting removes the ops burden and unlocks Starter, Growth, and Scale features.
          </p>
        </div>
      )}
      {/* Branch B: Licensed SaaS customer on customer VPS (billing disabled).
          They have a valid license JWT with a paid tier — admin manages billing centrally. */}
      {billingDisabled && tier && tier !== "community" && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Manage Subscription</p>
          <p className="text-xs text-gray-500">
            To upgrade or downgrade your plan, reach out to your NestFleet administrator.
          </p>
        </div>
      )}
      {/* Upgrade CTAs — shown only when billing is confirmed active (billingData returned) */}
      {!isPaid && availableUpgrades.length > 0 && !billingDisabled && billingData !== undefined && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-medium text-gray-700">Upgrade your plan</h3>
            <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
              <button
                onClick={() => setBillingInterval("monthly")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${billingInterval === "monthly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval("annual")}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${billingInterval === "annual" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Annual <span className="text-indigo-600 font-semibold">−20%</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {availableUpgrades.map((opt) => {
              const planKey = opt.id.toLowerCase() as "starter" | "growth";
              const isLoading = checkoutLoading === `${planKey}-${billingInterval}`;
              return (
                <div key={opt.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {billingInterval === "monthly" ? opt.monthlyPrice : opt.annuallyPrice}
                    <span className="text-xs font-normal text-gray-400"> / mo</span>
                  </p>
                  <ul className="space-y-1">
                    {(TIER_HIGHLIGHTS[planKey] ?? []).map((h) => (
                      <li key={h.label} className="flex items-start gap-1.5 text-xs text-gray-600">
                        <svg className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {h.label}{h.note && <span className="text-gray-400"> ({h.note})</span>}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => void handleCheckout(planKey, billingInterval)}
                    disabled={!!checkoutLoading}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                  >
                    {isLoading ? "Redirecting…" : `Upgrade to ${opt.label}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manage subscription — paid plans */}
      {isPaid && (
        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Manage subscription</p>
            <p className="text-xs text-gray-400">Change plan, update payment method, or view invoices.</p>
          </div>
          <button
            onClick={() => void handlePortal()}
            disabled={portalLoading}
            className="flex-shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors shadow-sm"
          >
            {portalLoading ? "Loading…" : "Manage →"}
          </button>
        </div>
      )}

      {license?.statusMessage && <p className="text-xs text-gray-300">{license.statusMessage}</p>}
    </div>
  );
}


// ── Roles & Permissions Section (SLICE-22 — Growth tier, read-only) ───────────

const DOMAIN_ORDER = [
  "cases", "signals", "change_requests", "pr_drafts",
  "approvals", "analytics", "settings", "compliance",
  "memory", "audit", "products",
];

const DOMAIN_LABELS: Record<string, string> = {
  cases: "Cases",
  signals: "Signals",
  change_requests: "Change Requests",
  pr_drafts: "PR Drafts",
  approvals: "Approvals",
  analytics: "Analytics",
  settings: "Settings",
  compliance: "Compliance",
  memory: "Memory",
  audit: "Audit",
  products: "Products",
};

function RolesSection() {
  const productId = useProductIdWithFallback();
  const { user } = useAuth();
  const { data: licenseData } = useSWR("license-status", getLicenseStatusApi);
  const licenseTier = licenseData?.data?.tier ?? null;
  // canEdit: enterprise (Scale tier) or dev mode (null tier)
  const canEdit = licenseTier === "enterprise" || licenseTier === null;

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set(DOMAIN_ORDER));

  // Edit state (Scale mode)
  const [editedGrants, setEditedGrants] = useState<Record<string, boolean>>({});
  const [isDirtyState, setIsDirtyState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Impact modal
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactPreview, setImpactPreview] = useState<{ affectedUsers: string[] } | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<string[]>([]);

  // Create role modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleKey, setNewRoleKey] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleCloneFrom, setNewRoleCloneFrom] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // SSO modal
  const [showSsoModal, setShowSsoModal] = useState(false);
  const [ssoGroupName, setSsoGroupName] = useState("");
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [ssoSaving, setSsoSaving] = useState(false);

  // Edit role modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRoleId, setEditRoleId] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleDesc, setEditRoleDesc] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete role confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);
  const [deleteRoleName, setDeleteRoleName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = user?.roles?.includes("admin") ?? false;

  const { data: rolesData, isLoading: rolesLoading, error: rolesError, mutate: mutateRoles } = useSWR(
    productId ? ["roles", productId] : null,
    () => getRolesApi(productId),
  );

  const roles: RoleSummary[] = rolesData?.data ?? [];

  // Auto-select first role when loaded
  const activeRoleId = selectedRoleId ?? roles[0]?.id ?? null;
  const isCustomRole = roles.find((r) => r.id === activeRoleId)?.type === "custom";

  const { data: permsData, isLoading: permsLoading, mutate: mutatePerms } = useSWR(
    productId && activeRoleId ? ["role-permissions", productId, activeRoleId] : null,
    () => getRolePermissionsApi(productId, activeRoleId!),
  );

  const permissions: PermissionWithGrant[] = permsData?.data?.permissions ?? [];

  // When permissions load or role changes, reset editedGrants to current state
  const [lastLoadedRoleId, setLastLoadedRoleId] = useState<string | null>(null);
  if (activeRoleId !== lastLoadedRoleId && permissions.length > 0) {
    const grants: Record<string, boolean> = {};
    for (const p of permissions) grants[p.id] = p.granted;
    setEditedGrants(grants);
    setIsDirtyState(false);
    setLastLoadedRoleId(activeRoleId);
  }

  // Group permissions by domain, preserving DOMAIN_ORDER
  const byDomain = new Map<string, PermissionWithGrant[]>();
  for (const d of DOMAIN_ORDER) byDomain.set(d, []);
  for (const p of permissions) {
    const list = byDomain.get(p.domain);
    if (list) list.push(p);
  }

  function toggleDomain(domain: string) {
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function handlePermToggle(permId: string, checked: boolean) {
    if (!canEdit || !isAdmin || !isCustomRole) return;
    setEditedGrants((prev) => {
      const next = { ...prev, [permId]: checked };
      const defaultGrants: Record<string, boolean> = {};
      for (const p of permissions) defaultGrants[p.id] = p.granted;
      const dirty = JSON.stringify(next) !== JSON.stringify(defaultGrants);
      setIsDirtyState(dirty);
      return next;
    });
  }

  function handleResetToDefault() {
    const grants: Record<string, boolean> = {};
    for (const p of permissions) grants[p.id] = p.granted;
    setEditedGrants(grants);
    setIsDirtyState(false);
  }

  async function handleSave() {
    if (!activeRoleId) return;
    const granted = Object.entries(editedGrants)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setPendingPermissions(granted);
    // Show impact modal first
    setShowImpactModal(true);
  }

  async function confirmSave() {
    if (!activeRoleId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const result = await updateRolePermissionsApi(productId, activeRoleId, pendingPermissions);
      setImpactPreview(result.data.impactPreview);
      setIsDirtyState(false);
      setSaveMsg("Saved");
      await mutatePerms();
      await mutateRoles();
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg(`Error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
      setShowImpactModal(false);
    }
  }

  async function handleCreateRole() {
    if (!newRoleName || !newRoleKey) {
      setCreateError("Name and key are required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await createCustomRoleApi(productId, {
        name: newRoleName,
        key: newRoleKey,
        description: newRoleDesc || undefined,
        clone_from: newRoleCloneFrom || undefined,
      });
      setShowCreateModal(false);
      setNewRoleName("");
      setNewRoleKey("");
      setNewRoleDesc("");
      setNewRoleCloneFrom("");
      await mutateRoles();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateSsoMapping() {
    if (!activeRoleId || !ssoGroupName) return;
    setSsoSaving(true);
    setSsoError(null);
    try {
      await createSsoMappingApi(productId, activeRoleId, { group_name: ssoGroupName });
      setShowSsoModal(false);
      setSsoGroupName("");
    } catch (err) {
      setSsoError((err as Error).message);
    } finally {
      setSsoSaving(false);
    }
  }

  function openEditModal(role: RoleSummary) {
    setEditRoleId(role.id);
    setEditRoleName(role.name);
    setEditRoleDesc("");
    setEditError(null);
    setShowEditModal(true);
  }

  async function handleEditRoleSubmit() {
    if (!editRoleId || !editRoleName.trim()) {
      setEditError("Name is required");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateCustomRoleApi(productId, editRoleId, { name: editRoleName.trim(), description: editRoleDesc || undefined });
      setShowEditModal(false);
      await mutateRoles();
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  }

  function openDeleteConfirm(role: RoleSummary) {
    setDeleteRoleId(role.id);
    setDeleteRoleName(role.name);
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }

  async function handleDeleteRole() {
    if (!deleteRoleId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomRoleApi(productId, deleteRoleId);
      setShowDeleteConfirm(false);
      if (selectedRoleId === deleteRoleId) setSelectedRoleId(null);
      await mutateRoles();
    } catch (err) {
      const msg = (err as Error).message;
      // Surface cascade error clearly
      setDeleteError(msg.includes("active users") ? "This role is assigned to active users. Reassign them first." : msg);
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    try {
      const result = await exportRolesApi(productId);
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roles-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setSaveMsg(`Export error: ${(err as Error).message}`);
    }
  }

  const dirtyCount = Object.entries(editedGrants).filter(([k, v]) => {
    const orig = permissions.find((p) => p.id === k);
    return orig && orig.granted !== v;
  }).length;

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (rolesError) {
    return <p className="text-sm text-red-600">Failed to load roles: {(rolesError as Error).message}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Roles &amp; Permissions</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {canEdit ? "Manage role permissions. Scale tier — full editing enabled." : "Read-only view. Upgrade to Scale to edit roles."}
          </p>
        </div>
        {isAdmin && canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Export JSON
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              + Create role
            </button>
          </div>
        )}
      </div>

      {/* Upgrade banner for non-Scale */}
      {!canEdit && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
          <svg className="h-3.5 w-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <span>Upgrade to <strong>Scale</strong> to create custom roles and edit permissions.</span>
        </div>
      )}

      {/* Save feedback */}
      {saveMsg && (
        <div className={`text-xs px-3 py-1.5 rounded-lg ${saveMsg === "Saved" ? "bg-green-50 text-green-700 ring-1 ring-green-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
          {saveMsg}
        </div>
      )}

      {/* Two-column: role picker | permission matrix */}
      <div className="flex gap-3">
        {/* Role picker */}
        <div className="w-40 shrink-0 space-y-0.5">
          {roles.map((role) => {
            const isRoleCustom = (role as RoleSummary & { type?: string }).type === "custom";
            return (
              <div key={role.id} className="group relative">
                <button
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                    activeRoleId === role.id
                      ? "bg-indigo-50 ring-1 ring-indigo-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <p className={`text-xs font-medium flex-1 truncate ${activeRoleId === role.id ? "text-indigo-700" : "text-gray-700"}`}>
                      {role.name}
                    </p>
                    {isRoleCustom && (
                      <span className="shrink-0 text-[9px] px-1 rounded bg-purple-100 text-purple-600">custom</span>
                    )}
                  </div>
                  <p className={`text-[10px] mt-0.5 ${activeRoleId === role.id ? "text-indigo-500" : "text-gray-400"}`}>
                    {role.permissionCount} permissions
                  </p>
                </button>
                {/* Edit / Delete actions — custom roles only, Scale admins only */}
                {canEdit && isAdmin && isRoleCustom && (
                  <div className="absolute right-1.5 top-1.5 hidden group-hover:flex items-center gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditModal(role); }}
                      title="Rename role"
                      className="rounded p-0.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeleteConfirm(role); }}
                      title="Delete role"
                      className="rounded p-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Permission matrix */}
        <div className="flex-1 min-w-0">
          {/* Matrix header with dirty badge + save/reset when editing */}
          {canEdit && isAdmin && isCustomRole && activeRoleId && (
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isDirtyState && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 font-medium">
                    {dirtyCount} change{dirtyCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isDirtyState && (
                  <button
                    onClick={handleResetToDefault}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={!isDirtyState || saving}
                  className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setShowSsoModal(true)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  + SSO group
                </button>
              </div>
            </div>
          )}

          {permsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : (
            <div className="space-y-1">
              {DOMAIN_ORDER.map((domain) => {
                const domainPerms = byDomain.get(domain) ?? [];
                if (domainPerms.length === 0) return null;
                const effectiveGrants = canEdit && isAdmin && isCustomRole
                  ? domainPerms.filter((p) => editedGrants[p.id] ?? p.granted)
                  : domainPerms.filter((p) => p.granted);
                const grantedCount = effectiveGrants.length;
                const isExpanded = expandedDomains.has(domain);

                return (
                  <div key={domain} className="rounded-lg border border-gray-100 overflow-hidden">
                    {/* Domain header */}
                    <div className="flex items-center bg-gray-50">
                      <button
                        onClick={() => toggleDomain(domain)}
                        className="flex-1 flex items-center justify-between px-3 py-2 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={`h-3 w-3 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          <span className="text-xs font-medium text-gray-700">{DOMAIN_LABELS[domain] ?? domain}</span>
                        </div>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          grantedCount === domainPerms.length
                            ? "bg-green-50 text-green-700"
                            : grantedCount === 0
                            ? "bg-gray-100 text-gray-500"
                            : "bg-amber-50 text-amber-700"
                        }`}>
                          {grantedCount}/{domainPerms.length}
                        </span>
                      </button>
                      {/* Select / Deselect all — only for editable custom roles */}
                      {canEdit && isAdmin && isCustomRole && (
                        <button
                          onClick={() => {
                            const allGranted = domainPerms.every((p) => editedGrants[p.id] ?? p.granted);
                            const updates: Record<string, boolean> = {};
                            for (const p of domainPerms) updates[p.id] = !allGranted;
                            setEditedGrants((prev) => {
                              const next = { ...prev, ...updates };
                              const defaultGrants: Record<string, boolean> = {};
                              for (const p of permissions) defaultGrants[p.id] = p.granted;
                              setIsDirtyState(JSON.stringify(next) !== JSON.stringify(defaultGrants));
                              return next;
                            });
                          }}
                          title={domainPerms.every((p) => editedGrants[p.id] ?? p.granted) ? "Revoke all permissions in this section" : "Grant all permissions in this section"}
                          className="shrink-0 px-2 py-2 text-[10px] text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 transition-colors border-l border-gray-100"
                        >
                          {domainPerms.every((p) => editedGrants[p.id] ?? p.granted) ? "Revoke" : "Grant"}
                        </button>
                      )}
                    </div>

                    {/* Permission rows */}
                    {isExpanded && (
                      <div className="divide-y divide-gray-50">
                        {domainPerms.map((perm) => {
                          const isGranted = canEdit && isAdmin && isCustomRole
                            ? (editedGrants[perm.id] ?? perm.granted)
                            : perm.granted;
                          return (
                            <div key={perm.id} className="flex items-start gap-3 px-3 py-2">
                              {/* Granted indicator / checkbox */}
                              <div className="mt-0.5 shrink-0">
                                {canEdit && isAdmin && isCustomRole ? (
                                  <input
                                    type="checkbox"
                                    checked={isGranted}
                                    onChange={(e) => handlePermToggle(perm.id, e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                ) : isGranted ? (
                                  <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                )}
                              </div>

                              {/* Label + description */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-xs font-medium ${isGranted ? "text-gray-800" : "text-gray-400"}`}>
                                    {perm.label}
                                  </span>
                                  {perm.destructive && (
                                    <span className="px-1 py-px rounded text-[10px] font-medium bg-red-50 text-red-600 ring-1 ring-red-100">
                                      destructive
                                    </span>
                                  )}
                                  {perm.sensitive && (
                                    <span className="px-1 py-px rounded text-[10px] font-medium bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                                      sensitive
                                    </span>
                                  )}
                                </div>
                                <p className={`text-[10px] mt-0.5 leading-relaxed ${isGranted ? "text-gray-500" : "text-gray-300"}`}>
                                  {perm.description}
                                </p>
                              </div>

                              {/* Permission ID */}
                              <code className={`shrink-0 text-[10px] font-mono ${isGranted ? "text-gray-400" : "text-gray-200"}`}>
                                {perm.id}
                              </code>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Impact preview modal */}
      {showImpactModal && (
        <Modal isOpen={showImpactModal} onClose={() => setShowImpactModal(false)} title="Confirm permission change">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You are about to save <strong>{pendingPermissions.length}</strong> permissions for this role.
            </p>
            {impactPreview && impactPreview.affectedUsers.length > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-medium mb-1">Affected users ({impactPreview.affectedUsers.length}):</p>
                <ul className="space-y-0.5">
                  {impactPreview.affectedUsers.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowImpactModal(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmSave}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Confirm & save"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create role modal */}
      {showCreateModal && (
        <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create custom role">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g. Data Protection Officer"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Key (slug)</label>
              <input
                type="text"
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                placeholder="e.g. dpo-role"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description (optional)</label>
              <input
                type="text"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                placeholder="Short description of role responsibilities"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clone from (optional)</label>
              <select
                value={newRoleCloneFrom}
                onChange={(e) => setNewRoleCloneFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">— start empty —</option>
                <option value="admin">admin</option>
                <option value="operator">operator</option>
                <option value="support_lead">support_lead</option>
                <option value="knowledge_lead">knowledge_lead</option>
                {roles.filter((r) => ("type" in r) && (r as RoleSummary & { type?: string }).type === "custom").map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            {createError && (
              <p className="text-xs text-red-600">{createError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRole}
                disabled={creating}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create role"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* SSO mapping modal */}
      {showSsoModal && (
        <Modal isOpen={showSsoModal} onClose={() => setShowSsoModal(false)} title="Map SSO group">
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Map a SAML/OIDC group to <strong>{roles.find((r) => r.id === activeRoleId)?.name ?? activeRoleId}</strong>.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Group name</label>
              <input
                type="text"
                value={ssoGroupName}
                onChange={(e) => setSsoGroupName(e.target.value)}
                placeholder="e.g. okta-admins"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            {ssoError && (
              <p className="text-xs text-red-600">{ssoError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowSsoModal(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSsoMapping}
                disabled={ssoSaving || !ssoGroupName}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {ssoSaving ? "Saving..." : "Save mapping"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit role modal */}
      {showEditModal && (
        <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Rename role">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={editRoleName}
                onChange={(e) => setEditRoleName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description <span className="text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={editRoleDesc}
                onChange={(e) => setEditRoleDesc(e.target.value)}
                placeholder="What is this role for?"
                className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            {editError && <p className="text-xs text-red-600">{editError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditRoleSubmit}
                disabled={editSaving || !editRoleName.trim()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete role confirmation modal */}
      {showDeleteConfirm && (
        <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete role">
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Delete <strong>{deleteRoleName}</strong>? This cannot be undone.
            </p>
            {deleteError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRole}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Contact Form Section ──────────────────────────────────────────────────────

function ContactFormSection({ settings }: { settings: SettingsResponse }) {
  const productId = useProductIdWithFallback();
  const [generating, setGenerating] = useState(false);
  const [currentKey, setCurrentKey] = useState<string | null>(
    settings.contactForm?.publicKey ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const apiUrl =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
      : "";

  const embedSnippet = currentKey
    ? `<div id="nestfleet-contact-form"\n     data-product-id="${productId}"\n     data-public-key="${currentKey}"\n     data-api-url="${apiUrl}"></div>\n<script src="${apiUrl}/widget/nestfleet-form.js"></script>`
    : null;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await generateContactFormKeyApi(productId);
      if (res.ok && res.publicKey) {
        setCurrentKey(res.publicKey);
        toast("New contact form key generated", "success");
      } else {
        setError(res.error ?? "Failed to generate key");
      }
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast(`${label} copied`, "success"));
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Contact Form"
        description="Embed a hosted contact form widget on your website. Submissions become support cases automatically."
      />

      {/* Key status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-600">
            Public API Key
            {currentKey ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Configured
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                Not configured
              </span>
            )}
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating…" : currentKey ? "Regenerate key" : "Generate key"}
          </button>
        </div>

        {currentKey && (
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={`${currentKey.slice(0, 14)}${"•".repeat(20)}`}
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 font-mono"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(currentKey, "API key")}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Copy
            </button>
          </div>
        )}

        {!currentKey && (
          <p className="text-[11px] text-gray-400">
            Generate a public API key to enable the embeddable contact form widget.
          </p>
        )}

        {currentKey && (
          <p className="text-[10px] text-gray-400">
            Regenerating the key will invalidate any existing widget deployments — update the embed snippet on your website.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Embed snippet */}
      {embedSnippet && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600">Embed snippet</label>
            <button
              type="button"
              onClick={() => copyToClipboard(embedSnippet, "Embed snippet")}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Copy snippet
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-[11px] text-gray-600 font-mono whitespace-pre-wrap break-all">
            {embedSnippet}
          </pre>
          <p className="text-[10px] text-gray-400">
            Paste this into any HTML page where you want the contact form to appear.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-lg bg-indigo-50 px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-indigo-800">How it works</p>
        <ul className="text-[11px] text-indigo-700 space-y-0.5 list-disc list-inside">
          <li>Visitors fill in the form on your website — no login required</li>
          <li>Each submission is deduplicated and creates a support case</li>
          <li>Replies go out via your configured email channel</li>
          <li>Rate-limited to 10 submissions per IP per minute</li>
        </ul>
      </div>
    </div>
  );
}

// ── Chat Widget Section ────────────────────────────────────────────────────────

function ChatWidgetSection({ settings }: { settings: SettingsResponse }) {
  const productId = useProductIdWithFallback();
  const chat = settings.chat;

  const [enabled, setEnabled] = useState(chat?.enabled ?? false);
  const [welcomeMessage, setWelcomeMessage] = useState(
    chat?.welcomeMessage ?? "Hi! How can we help you today?",
  );
  const [color, setColor] = useState(chat?.color ?? "#4f46e5");
  const [currentKey, setCurrentKey] = useState<string | null>(chat?.publicKey ?? null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const apiUrl =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
      : "";

  const embedSnippet = currentKey
    ? `<script\n  src="${apiUrl}/widget/nestfleet-chat.js"\n  data-product-id="${productId}"\n  data-public-key="${currentKey}"\n  data-api-url="${apiUrl}"\n></script>`
    : null;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateSettingsApi(productId, {
        chat: { enabled, welcomeMessage, color },
      });
      toast("Chat widget settings saved", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateKey() {
    setGenerating(true);
    setError(null);
    try {
      const res = await generateChatKeyApi(productId);
      if (res.ok && res.publicKey) {
        setCurrentKey(res.publicKey);
        toast("New chat widget key generated", "success");
      } else {
        setError(res.error ?? "Failed to generate key");
      }
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast(`${label} copied`, "success"));
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Chat Widget"
        description="Embed a live chat bubble on your website. Visitors can message your team in real time and operators reply from the case view."
      />

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Enable chat widget</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            When enabled, the embedded bubble accepts incoming messages.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            enabled ? "bg-indigo-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Welcome message */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">Welcome message</label>
        <input
          type="text"
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          placeholder="Hi! How can we help you today?"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        <p className="text-[10px] text-gray-400">
          Shown to visitors before they send their first message.
        </p>
      </div>

      {/* Accent color */}
      <div className="space-y-1">
        <label className="block text-xs font-medium text-gray-600">Accent color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#4f46e5"
            className="w-32 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <p className="text-[10px] text-gray-400">
          Used for the chat bubble and header bar. Enter a hex color value.
        </p>
      </div>

      {/* Save button */}
      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100" />

      {/* API key */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-medium text-gray-600">
            Public API Key
            {currentKey ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-green-600">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Configured
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-normal text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
                Not configured
              </span>
            )}
          </label>
          <button
            type="button"
            onClick={handleGenerateKey}
            disabled={generating}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {generating ? "Generating…" : currentKey ? "Regenerate key" : "Generate key"}
          </button>
        </div>

        {currentKey && (
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={`${currentKey.slice(0, 14)}${"•".repeat(20)}`}
              className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 font-mono"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(currentKey, "API key")}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Copy
            </button>
          </div>
        )}

        {!currentKey && (
          <p className="text-[11px] text-gray-400">
            Generate a public API key to activate the chat widget embed.
          </p>
        )}

        {currentKey && (
          <p className="text-[10px] text-gray-400">
            Regenerating the key invalidates existing widget deployments — update the embed snippet on your site.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Embed snippet */}
      {embedSnippet && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600">Embed snippet</label>
            <button
              type="button"
              onClick={() => copyToClipboard(embedSnippet, "Embed snippet")}
              className="text-[10px] text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Copy snippet
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-[11px] text-gray-600 font-mono whitespace-pre-wrap break-all">
            {embedSnippet}
          </pre>
          <p className="text-[10px] text-gray-400">
            Paste this before the closing{" "}
            <code className="font-mono">&lt;/body&gt;</code> tag on any page where you want the chat bubble to appear.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-lg bg-indigo-50 px-4 py-3 space-y-1">
        <p className="text-xs font-medium text-indigo-800">How it works</p>
        <ul className="text-[11px] text-indigo-700 space-y-0.5 list-disc list-inside">
          <li>A floating chat bubble appears on your website — no login required for visitors</li>
          <li>Each conversation creates a support case with a live reply stream</li>
          <li>Operators reply directly from the case detail view in real time</li>
          <li>Sessions are identified by a browser token stored in localStorage</li>
          <li>Rate-limited to 30 messages per session per minute</li>
        </ul>
      </div>
    </div>
  );
}
