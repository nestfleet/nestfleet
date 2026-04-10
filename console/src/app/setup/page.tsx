"use client";

/**
 * SLICE-12: First-Run Configuration Wizard
 *
 * 5-step wizard shown when no product exists yet (needsSetup = true).
 * Steps:
 *   1 — Welcome        (product name)
 *   2 — Connect LLM    (provider card + API key + Test Connection + model select)
 *   3 — Assign Leads   (support_lead, change_lead, product_lead email inputs)
 *   4 — Connect GitHub (repo URL + PAT token)
 *   5 — Done           (redirect to /cases)
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getSetupStatusApi,
  setupCompleteApi,
  setupListModelsApi,
  type SetupCompletePayload,
} from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnectionState = "idle" | "testing" | "connected" | "failed";

const PROVIDER_CARDS = [
  { value: "openai",      label: "OpenAI",       desc: "GPT-4o, o3, o4-mini",           icon: "O"  },
  { value: "anthropic",   label: "Anthropic",    desc: "Claude Sonnet, Haiku, Opus",     icon: "A"  },
  { value: "google",      label: "Google",       desc: "Gemini 2.x, Flash, Pro",         icon: "G"  },
  { value: "azure-openai",label: "Azure OpenAI", desc: "Enterprise OpenAI hosting",      icon: "Az" },
  { value: "self-hosted", label: "Self-Hosted",  desc: "Ollama, vLLM, LiteLLM",          icon: "S"  },
] as const;

const STEPS = [
  { num: 1, label: "Welcome"  },
  { num: 2, label: "LLM"      },
  { num: 3, label: "Leads"    },
  { num: 4, label: "GitHub"   },
  { num: 5, label: "Done"     },
];

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Setup progress" className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const done    = s.num < current;
        const active  = s.num === current;
        return (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                aria-current={active ? "step" : undefined}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  done   ? "bg-indigo-600 text-white" :
                  active ? "bg-indigo-600 text-white ring-4 ring-indigo-100" :
                  "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : s.num}
              </div>
              <span className={`text-[10px] font-medium ${active ? "text-indigo-600" : "text-gray-400"}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 sm:w-12 mx-1 mb-4 transition-colors ${done ? "bg-indigo-300" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── Nav Buttons ───────────────────────────────────────────────────────────────

function StepNav({
  step,
  totalSteps,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  nextLoading = false,
}: {
  step: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-5 mt-5 border-t border-gray-100">
      <button
        onClick={onBack}
        disabled={step <= 1}
        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Back
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled || nextLoading}
        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
      >
        {nextLoading && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
        )}
        {nextLabel}
      </button>
    </div>
  );
}

// ── Step 1: Welcome ───────────────────────────────────────────────────────────

function Step1Welcome({
  productName,
  onChange,
}: {
  productName: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Welcome to NestFleet</h1>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          This wizard will set up your first product in about 2 minutes.
          You can change everything later in Settings.
        </p>
      </div>

      <div>
        <label htmlFor="productName" className="block text-sm font-medium text-gray-700 mb-1.5">
          What is your product called?
        </label>
        <input
          id="productName"
          type="text"
          value={productName}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. DocuGardener, SkillSeal, Acme SaaS"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
          autoFocus
        />
        <p className="mt-1.5 text-[11px] text-gray-400">
          This name will appear throughout the console.
        </p>
      </div>
    </div>
  );
}

// ── Step 2: LLM ───────────────────────────────────────────────────────────────

function Step2Llm({
  provider,
  apiKey,
  baseUrl,
  model,
  models,
  connectionState,
  connectionMsg,
  onProviderChange,
  onApiKeyChange,
  onBaseUrlChange,
  onModelChange,
  onTestConnection,
}: {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  models: string[];
  connectionState: ConnectionState;
  connectionMsg: string;
  onProviderChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onBaseUrlChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onTestConnection: () => void;
}) {
  const isSelfHosted = provider === "self-hosted";
  const needsBaseUrl = isSelfHosted || provider === "azure-openai";
  const hasKey = !!(apiKey);

  const statusDot =
    connectionState === "connected" ? "bg-green-500" :
    connectionState === "failed"    ? "bg-red-500" :
    connectionState === "testing"   ? "bg-amber-400 animate-pulse" :
    "bg-gray-300";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Connect your LLM</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Select a provider, enter your API key, and test the connection to load models.
        </p>
      </div>

      {/* Provider cards */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-2">Provider</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PROVIDER_CARDS.map((p) => {
            const isActive = provider === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => onProviderChange(p.value)}
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

      {provider && (
        <>
          {/* Base URL for self-hosted / Azure */}
          {needsBaseUrl && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {isSelfHosted ? "Endpoint URL" : "Azure Resource URL"}
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder={isSelfHosted ? "http://localhost:11434" : "https://your-resource.openai.azure.com"}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}

          {/* API Key + Test Connection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              API Key
              {isSelfHosted && <span className="text-gray-400 font-normal ml-1">(optional for local)</span>}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={isSelfHosted ? "Leave empty for local access" : "Paste your API key"}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                onClick={onTestConnection}
                disabled={connectionState === "testing" || (!isSelfHosted && !hasKey)}
                className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {connectionState === "testing" ? "Connecting..." : "Test Connection"}
              </button>
            </div>

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

          {/* Model selector — shown after connection */}
          {(models.length > 0 || model) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Chat Model</label>
              {models.length > 0 ? (
                <select
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
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
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder="Type model name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        No LLM yet? You can skip this step and configure it later in Settings.
      </p>
    </div>
  );
}

// ── Step 3: Leads ─────────────────────────────────────────────────────────────

function Step3Leads({
  supportLead, changeLead, productLead,
  onSupportLead, onChangeLead, onProductLead,
}: {
  supportLead: string; changeLead: string; productLead: string;
  onSupportLead: (v: string) => void; onChangeLead: (v: string) => void; onProductLead: (v: string) => void;
}) {
  const fields = [
    {
      id: "supportLead", label: "Support Lead", value: supportLead, onChange: onSupportLead,
      desc: "Receives escalations and auto-reply review requests",
    },
    {
      id: "changeLead", label: "Change Lead", value: changeLead, onChange: onChangeLead,
      desc: "Approves change requests and PR draft reviews",
    },
    {
      id: "productLead", label: "Product Lead", value: productLead, onChange: onProductLead,
      desc: "Handles product decisions and outage coordination",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Assign your leads</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Map email addresses to key roles. NestFleet routes approvals and escalations here.
        </p>
      </div>

      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.id}>
            <label htmlFor={f.id} className="block text-xs font-medium text-gray-700 mb-1">
              {f.label}
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </label>
            <input
              id={f.id}
              type="email"
              value={f.value}
              onChange={(e) => f.onChange(e.target.value)}
              placeholder="lead@yourcompany.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <p className="mt-0.5 text-[10px] text-gray-400">{f.desc}</p>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
        All fields are optional. You can add or update leads anytime from Settings.
      </p>
    </div>
  );
}

// ── Step 4: GitHub ────────────────────────────────────────────────────────────

function Step4GitHub({
  repoUrl, patToken,
  onRepoUrl, onPatToken,
}: {
  repoUrl: string; patToken: string;
  onRepoUrl: (v: string) => void; onPatToken: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Connect GitHub</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          NestFleet uses GitHub to create issues and draft pull requests for change requests.
        </p>
      </div>

      <div>
        <label htmlFor="repoUrl" className="block text-xs font-medium text-gray-700 mb-1">
          Repository URL
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <input
          id="repoUrl"
          type="url"
          value={repoUrl}
          onChange={(e) => onRepoUrl(e.target.value)}
          placeholder="https://github.com/your-org/your-repo"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div>
        <label htmlFor="patToken" className="block text-xs font-medium text-gray-700 mb-1">
          Personal Access Token (PAT)
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </label>
        <input
          id="patToken"
          type="password"
          value={patToken}
          onChange={(e) => onPatToken(e.target.value)}
          placeholder="ghp_..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
        <p className="mt-1 text-[10px] text-gray-400">
          Requires: <span className="font-mono">repo</span> scope. Create at github.com/settings/tokens.
        </p>
      </div>

      <div className="rounded-lg bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100">
        <p className="text-[11px] text-amber-700">
          GitHub integration is optional — NestFleet will work without it. You can configure it later in Settings.
        </p>
      </div>
    </div>
  );
}

// ── Step 5: Done ──────────────────────────────────────────────────────────────

function Step5Done({ productName, onGo }: { productName: string; onGo: () => void }) {
  return (
    <div className="space-y-6 text-center py-4">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-gray-900">{productName} is ready!</h2>
        <p className="text-sm text-gray-500">
          Your product is configured. You can update any setting from the console.
        </p>
      </div>
      <button
        onClick={onGo}
        className="rounded-xl bg-indigo-600 px-7 py-3 text-sm font-bold text-white shadow hover:bg-indigo-700 transition-colors"
      >
        Open the console
      </button>
    </div>
  );
}

// ── Main Wizard Page ──────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1
  const [productName, setProductName] = useState("");

  // Step 2
  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [connectionMsg, setConnectionMsg] = useState("");

  // Step 3
  const [supportLead, setSupportLead] = useState("");
  const [changeLead, setChangeLead] = useState("");
  const [productLead, setProductLead] = useState("");

  // Step 4
  const [repoUrl, setRepoUrl] = useState("");
  const [patToken, setPatToken] = useState("");

  // Verify setup is actually needed — if already done, redirect to /cases
  useEffect(() => {
    getSetupStatusApi()
      .then((res) => {
        if (!res.data.needsSetup) {
          router.replace("/cases");
        }
      })
      .catch(() => { /* API down — let the wizard render anyway */ })
      .finally(() => setCheckingStatus(false));
  }, [router]);

  function handleProviderChange(v: string) {
    setProvider(v);
    setModels([]);
    setModel("");
    setConnectionState("idle");
    setConnectionMsg("");
  }

  async function handleTestConnection() {
    if (!provider) return;
    setConnectionState("testing");
    setConnectionMsg("");
    setModels([]);

    try {
      const res = await setupListModelsApi({
        provider,
        apiKey: apiKey || undefined,
        baseUrl: (provider === "self-hosted" || provider === "azure-openai") ? (baseUrl || undefined) : undefined,
      });
      if (res.data.models.length > 0) {
        setModels(res.data.models);
        setConnectionState("connected");
        setConnectionMsg(`${res.data.models.length} models available`);
        if (!model) setModel(res.data.models[0]);
      } else {
        setConnectionState("connected");
        setConnectionMsg("Connected — no models returned. Type model name manually.");
      }
    } catch (err) {
      setConnectionState("failed");
      setConnectionMsg((err as Error).message?.slice(0, 120) ?? "Connection failed");
    }
  }

  async function handleFinish() {
    setSubmitting(true);
    setSubmitError(null);

    const payload: SetupCompletePayload = {
      productName,
    };

    if (provider && model) {
      payload.llm = {
        provider,
        model,
        ...(apiKey ? { apiKey } : {}),
        ...((provider === "self-hosted" || provider === "azure-openai") && baseUrl ? { baseUrl } : {}),
      };
    }

    if (supportLead || changeLead || productLead) {
      payload.leads = {
        ...(supportLead ? { support_lead: supportLead } : {}),
        ...(changeLead  ? { change_lead: changeLead }   : {}),
        ...(productLead ? { product_lead: productLead } : {}),
      };
    }

    if (repoUrl || patToken) {
      payload.github = {
        ...(repoUrl   ? { repoUrl }   : {}),
        ...(patToken  ? { patToken }  : {}),
      };
    }

    try {
      const res = await setupCompleteApi(payload);
      // Set nf_last_product cookie immediately so the console knows which product
      // to load without relying on resolve-product (which uses a stale JWT that
      // was issued before this product existed and has productIds: []).
      const slug = res.data.productSlug;
      if (slug) {
        const maxAge = 60 * 60 * 24 * 365;
        document.cookie = `nf_last_product=${encodeURIComponent(slug)}; path=/; SameSite=Lax; max-age=${maxAge}`;
        router.replace(`/p/${slug}/queue`);
      } else {
        setStep(5);
      }
    } catch (err) {
      setSubmitError((err as Error).message ?? "Setup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (step === 4) {
      handleFinish();
      return;
    }
    setStep((s) => Math.min(s + 1, 5));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  // Next button disabled logic per step
  const nextDisabled =
    (step === 1 && !productName.trim()) ||
    (step === 4 && submitting);

  if (checkingStatus) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </span>
            <span className="font-bold text-gray-900">NestFleet Setup</span>
          </div>
        </div>

        {/* Stepper */}
        {step < 5 && <Stepper current={step} />}

        {/* Card */}
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 p-6 sm:p-7">
          {/* Error banner */}
          {submitError && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
              {submitError}
            </div>
          )}

          {step === 1 && (
            <>
              <Step1Welcome productName={productName} onChange={setProductName} />
              <StepNav
                step={step}
                totalSteps={5}
                onBack={handleBack}
                onNext={handleNext}
                nextDisabled={!productName.trim()}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Step2Llm
                provider={provider}
                apiKey={apiKey}
                baseUrl={baseUrl}
                model={model}
                models={models}
                connectionState={connectionState}
                connectionMsg={connectionMsg}
                onProviderChange={handleProviderChange}
                onApiKeyChange={setApiKey}
                onBaseUrlChange={setBaseUrl}
                onModelChange={setModel}
                onTestConnection={handleTestConnection}
              />
              <StepNav
                step={step}
                totalSteps={5}
                onBack={handleBack}
                onNext={handleNext}
                // LLM step is optional — can proceed with no provider selected
                nextDisabled={!!(provider && !model)}
                nextLabel={(!provider) ? "Skip" : "Next"}
              />
            </>
          )}

          {step === 3 && (
            <>
              <Step3Leads
                supportLead={supportLead}
                changeLead={changeLead}
                productLead={productLead}
                onSupportLead={setSupportLead}
                onChangeLead={setChangeLead}
                onProductLead={setProductLead}
              />
              <StepNav
                step={step}
                totalSteps={5}
                onBack={handleBack}
                onNext={handleNext}
              />
            </>
          )}

          {step === 4 && (
            <>
              <Step4GitHub
                repoUrl={repoUrl}
                patToken={patToken}
                onRepoUrl={setRepoUrl}
                onPatToken={setPatToken}
              />
              <StepNav
                step={step}
                totalSteps={5}
                onBack={handleBack}
                onNext={handleNext}
                nextLabel="Finish Setup"
                nextDisabled={nextDisabled}
                nextLoading={submitting}
              />
            </>
          )}

          {step === 5 && (
            <Step5Done
              productName={productName}
              onGo={() => router.replace("/cases")}
            />
          )}
        </div>

        <p className="mt-5 text-center text-xs text-gray-400">
          NestFleet operator console — authorized access only
        </p>
      </div>
    </div>
  );
}
