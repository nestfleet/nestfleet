/**
 * Typed fetch wrapper for the NestFleet API.
 * - Reads NEXT_PUBLIC_API_URL for the base URL
 * - Reads JWT from localStorage key `nestfleet_token`
 * - Throws ApiError on non-2xx responses
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("nestfleet_token");
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Skip adding the Authorization header (used for login) */
  skipAuth?: boolean;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, skipAuth = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `API error ${response.status}`;
    try {
      const errBody = await response.json() as { message?: string; error?: string };
      message = errBody.message ?? errBody.error ?? message;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ─── Products (DEFERRED-21) ──────────────────────────────────────────────────

export interface ProductSummary {
  productId:   string;
  slug:        string;
  name:        string;
  stage:       string;
  accentColor?: string;
}

export async function getProductsApi(): Promise<{ ok: boolean; products: ProductSummary[] }> {
  return apiFetch("/api/v1/products");
}

export async function createProductApi(body: {
  name:  string;
  stage?: "pre-launch" | "beta" | "production";
}): Promise<{ ok: boolean; product: ProductSummary; token?: string }> {
  return apiFetch("/api/v1/products", { method: "POST", body });
}

export async function updateProductApi(
  productId: string,
  body: { name?: string; stage?: string; accentColor?: string },
): Promise<{ ok: boolean; product: ProductSummary }> {
  return apiFetch(`/api/v1/products/${productId}`, { method: "PATCH", body });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

import type { LoginResponse, AuthUser, ApiItemResponse } from "./types";

export async function loginApi(
  email: string,
  password: string
): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
  });
}

export async function getMeApi(): Promise<AuthUser> {
  // /auth/me returns a flat object (no data wrapper), consistent with login response
  return apiFetch<AuthUser>("/api/v1/auth/me");
}

// ─── Cases ───────────────────────────────────────────────────────────────────

import type { CaseRow, ApiListResponse } from "./types";

export async function getCasesApi(
  productId: string,
  params?: { status?: string; severity?: string; channel?: string }
): Promise<ApiListResponse<CaseRow>> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.severity) qs.set("severity", params.severity);
  if (params?.channel) qs.set("channel", params.channel);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<ApiListResponse<CaseRow>>(
    `/api/v1/products/${productId}/cases${query}`
  );
}

export async function getCaseApi(
  productId: string,
  caseId: string
): Promise<CaseRow> {
  const res = await apiFetch<ApiItemResponse<CaseRow>>(
    `/api/v1/products/${productId}/cases/${caseId}`
  );
  return res.data;
}

export async function sendDraftReplyApi(
  productId: string,
  caseId: string,
  replyText: string,
): Promise<{ ok: boolean; data?: { caseId: string; sentTo: string }; error?: string }> {
  return apiFetch(`/api/v1/products/${productId}/cases/${caseId}/send-draft-reply`, {
    method: "POST",
    body: { reply_text: replyText },
  });
}

export interface ConversationMessage {
  signal_id:   string;
  source_type: string;
  received_at: string;
  from_email:  string | null;
  subject:     string | null;
  body:        string;
  direction:   "inbound" | "outbound";
}

export async function getCaseConversationApi(
  productId: string,
  caseId: string,
): Promise<{ data: ConversationMessage[]; meta: { caseId: string; count: number } }> {
  return apiFetch(`/api/v1/products/${productId}/cases/${caseId}/conversation`);
}

export async function sendChatReplyApi(
  productId: string,
  caseId: string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch(`/api/v1/products/${productId}/cases/${caseId}/chat/reply`, {
      method: "POST",
      body: { message },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Change Requests ─────────────────────────────────────────────────────────

import type { ChangeRequest } from "./types";

export async function getPendingApprovalsApi(
  productId: string
): Promise<ApiListResponse<ChangeRequest>> {
  return apiFetch<ApiListResponse<ChangeRequest>>(
    `/api/v1/products/${productId}/change-requests/pending-approval`
  );
}

export async function getPrDraftedChangeRequestsApi(
  productId: string
): Promise<{ data: ChangeRequest[]; meta: { productId: string; count: number } }> {
  return apiFetch(
    `/api/v1/products/${productId}/change-requests/pr-drafted`
  );
}

export async function getPrDraftApi(
  productId: string,
  crId: string
): Promise<ChangeRequest> {
  const res = await apiFetch<ApiItemResponse<ChangeRequest>>(
    `/api/v1/products/${productId}/change-requests/${crId}/pr-draft`
  );
  return res.data;
}

export async function completeChangeRequestApi(
  productId: string,
  crId: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/products/${productId}/change-requests/${crId}/complete`,
    { method: "POST", body: {} }
  );
}

export async function getChangeRequestApi(
  productId: string,
  crId: string
): Promise<ChangeRequest> {
  const res = await apiFetch<ApiItemResponse<ChangeRequest>>(
    `/api/v1/products/${productId}/change-requests/${crId}`
  );
  return res.data;
}

export async function approveChangeRequestApi(
  productId: string,
  crId: string,
  rationale?: string,
  editedContent?: string  // DEFERRED-19: Lead's edited proposed_scope
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/products/${productId}/change-requests/${crId}/approve`,
    {
      method: "POST",
      body: {
        rationale:     rationale ?? "",
        ...(editedContent !== undefined ? { editedContent } : {}),
      },
    }
  );
}

export async function rejectChangeRequestApi(
  productId: string,
  crId: string,
  rationale: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/products/${productId}/change-requests/${crId}/reject`,
    {
      method: "POST",
      body: { rationale },
    }
  );
}

// ─── Lineage ──────────────────────────────────────────────────────────────────

import type { LineageResponse } from "./types";

export async function getLineageApi(
  productId: string,
  caseId: string
): Promise<LineageResponse> {
  const res = await apiFetch<{ data: LineageResponse }>(
    `/api/v1/products/${productId}/cases/${caseId}/lineage`
  );
  return res.data;
}

export async function escalateCaseApi(
  productId: string,
  caseId: string
): Promise<void> {
  await apiFetch<void>(`/api/v1/products/${productId}/cases/${caseId}`, {
    method: "PATCH",
    body: { status: "awaiting-lead" },
  });
}

export async function sendToChangeApi(
  productId: string,
  caseId: string
): Promise<{ caseId: string; changeRequestId: string }> {
  const res = await apiFetch<{ ok: boolean; data: { caseId: string; changeRequestId: string } }>(
    `/api/v1/products/${productId}/cases/${caseId}/send-to-change`,
    { method: "POST", body: {} }
  );
  return res.data;
}

export async function resolveCaseApi(
  productId: string,
  caseId: string,
  resolution: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/products/${productId}/cases/${caseId}/resolve`,
    { method: "POST", body: { resolution } }
  );
}

export async function reopenCaseApi(
  productId: string,
  caseId: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/products/${productId}/cases/${caseId}/reopen`,
    { method: "POST", body: {} }
  );
}

export async function sendFollowupApi(
  productId: string,
  caseId: string,
  message: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/products/${productId}/cases/${caseId}/send-followup`,
    { method: "POST", body: { message } }
  );
}

export async function forwardToTeamApi(
  productId: string,
  caseId: string,
  team: "sales" | "support" | "legal" | "billing",
  note: string
): Promise<void> {
  await apiFetch<void>(
    `/api/v1/products/${productId}/cases/${caseId}/forward-to-team`,
    { method: "POST", body: { team, note } }
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

import type { Notification } from "./types";

export async function getNotificationsApi(
  productId: string,
  params?: { status?: string; kind?: string; priority?: string; limit?: number; offset?: number },
): Promise<{ data: Notification[]; meta: Record<string, unknown> }> {
  const query = new URLSearchParams();
  if (params?.status)   query.set("status",   params.status);
  if (params?.kind)     query.set("kind",     params.kind);
  if (params?.priority) query.set("priority", params.priority);
  if (params?.limit)    query.set("limit",    String(params.limit));
  if (params?.offset)   query.set("offset",   String(params.offset));
  const qs = query.toString();
  return apiFetch(`/api/v1/products/${productId}/notifications${qs ? `?${qs}` : ""}`);
}

export async function ackNotificationApi(
  productId: string,
  notificationId: string,
): Promise<{ data: Notification }> {
  return apiFetch(
    `/api/v1/products/${productId}/notifications/${notificationId}/ack`,
    { method: "POST" },
  );
}

// ── Settings (SLICE-11) ──────────────────────────────────────────────────────

export interface SettingsResponse {
  llm: {
    provider: string | null;
    model: string | null;
    baseUrl: string | null;
    apiKeyLast4: string | null;
    configured: boolean;
    embeddingModel: string | null;
    embeddingDimensions: number;
  };
  leads: {
    support_lead: string | null;
    change_lead: string | null;
    product_lead: string | null;
    knowledge_lead: string | null;
  };
  agent: { tone: string };
  notifications: {
    quietHoursStart: string;
    quietHoursEnd: string;
    weekendSuppression: boolean;
    slackWebhookConfigured: boolean;
    slackWebhookLast4: string | null;
    telegramConfigured: boolean;
  };
  ci?: {
    enabled: boolean;
    webhookConfigured: boolean;
    autoCompleteOnCiPass: boolean;
    trackDeployments: boolean;
    githubPatConfigured: boolean;
    githubRepo: string | null;
  };
  retention?: {
    retentionDays: number;
    autoCloseDays: number;
  };
  contactForm?: {
    publicKey: string | null;
    configured: boolean;
  };
  chat?: {
    enabled: boolean;
    welcomeMessage: string;
    color: string;
    publicKey: string | null;
    configured: boolean;
  };
}

export async function getSettingsApi(
  productId: string,
): Promise<{ data: SettingsResponse }> {
  return apiFetch(`/api/v1/products/${productId}/settings`);
}

export async function updateSettingsApi(
  productId: string,
  body: Record<string, unknown>,
): Promise<{ data: SettingsResponse }> {
  return apiFetch(`/api/v1/products/${productId}/settings`, {
    method: "PUT",
    body,
  });
}

export interface TestLlmResult {
  success: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  responsePreview?: string;
  error?: string;
}

export async function testLlmApi(
  productId: string,
  body: { provider: string; model: string; apiKey?: string; baseUrl?: string },
): Promise<{ data: TestLlmResult }> {
  return apiFetch(`/api/v1/products/${productId}/settings/test-llm`, {
    method: "POST",
    body,
  });
}

export async function testSlackApi(
  productId: string,
): Promise<{ ok: boolean; error?: string }> {
  return apiFetch(`/api/v1/products/${productId}/settings/test-slack`, { method: "POST" });
}

export async function generateContactFormKeyApi(
  productId: string,
): Promise<{ ok: boolean; publicKey?: string; error?: string }> {
  return apiFetch(`/api/v1/products/${productId}/settings/generate-contact-form-key`, { method: "POST" });
}

export async function generateChatKeyApi(
  productId: string,
): Promise<{ ok: boolean; publicKey?: string; error?: string }> {
  return apiFetch(`/api/v1/products/${productId}/settings/generate-chat-key`, { method: "POST" });
}

// ── Knowledge Assets ─────────────────────────────────────────────────────────

export type KnowledgeAssetType = "faq" | "known_issue" | "runbook_update" | "docs_update";
export type KnowledgeAssetStatus = "proposed" | "approved" | "rejected" | "published";

export interface KnowledgeAsset {
  assetId: string;
  caseId: string;
  assetType: KnowledgeAssetType;
  status: KnowledgeAssetStatus;
  title: string;
  content: string;
  confidence: number;
  sourceRefs: string[];
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface KnowledgeAssetStats {
  proposed: number;
  approved: number;
  rejected: number;
  published: number;
}

export async function listKnowledgeAssetsApi(
  productId: string,
  status?: KnowledgeAssetStatus,
): Promise<{ data: { assets: KnowledgeAsset[] } }> {
  const qs = status ? `?status=${status}` : "";
  return apiFetch(`/api/v1/products/${productId}/knowledge-assets${qs}`);
}

export async function getKnowledgeAssetStatsApi(
  productId: string,
): Promise<{ data: KnowledgeAssetStats }> {
  return apiFetch(`/api/v1/products/${productId}/knowledge-assets/stats`);
}

export async function approveKnowledgeAssetApi(
  productId: string,
  assetId: string,
  reviewNote?: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/products/${productId}/knowledge-assets/${assetId}/approve`, {
    method: "PUT",
    body: reviewNote ? { reviewNote } : {},
  });
}

export async function rejectKnowledgeAssetApi(
  productId: string,
  assetId: string,
  reviewNote?: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/products/${productId}/knowledge-assets/${assetId}/reject`, {
    method: "PUT",
    body: reviewNote ? { reviewNote } : {},
  });
}

export async function publishKnowledgeAssetApi(
  productId: string,
  assetId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/products/${productId}/knowledge-assets/${assetId}/publish`, {
    method: "PUT",
  });
}

export interface ListModelsResult {
  provider: string;
  models: string[];
}

export async function listModelsApi(
  productId: string,
  body: { provider: string; apiKey?: string; baseUrl?: string },
): Promise<{ data: ListModelsResult }> {
  return apiFetch(`/api/v1/products/${productId}/settings/list-models`, {
    method: "POST",
    body,
  });
}

// ── Setup (SLICE-12) ─────────────────────────────────────────────────────────

export async function getSetupStatusApi(): Promise<{ data: { needsSetup: boolean } }> {
  return apiFetch("/api/v1/setup/status", { skipAuth: true });
}

export interface SetupCompletePayload {
  productName: string;
  llm?: {
    provider: string;
    model: string;
    apiKey?: string;
    baseUrl?: string;
  };
  leads?: {
    support_lead?: string;
    change_lead?: string;
    product_lead?: string;
  };
  github?: {
    repoUrl?: string;
    patToken?: string;
  };
}

export async function setupCompleteApi(
  payload: SetupCompletePayload,
): Promise<{ data: { productId: string; productName: string } }> {
  return apiFetch("/api/v1/setup/complete", {
    method: "POST",
    body: payload,
    skipAuth: true,
  });
}

export async function setupListModelsApi(
  body: { provider: string; apiKey?: string; baseUrl?: string },
): Promise<{ data: ListModelsResult }> {
  return apiFetch("/api/v1/setup/list-models", {
    method: "POST",
    body,
    skipAuth: true,
  });
}

// ── Users ────────────────────────────────────────────────────────────────────

import type { OperatorUser, LicenseStatus } from "./types";

export async function listUsersApi(): Promise<{ data: OperatorUser[] }> {
  return apiFetch("/api/v1/users");
}

export async function createUserApi(data: {
  email: string;
  password: string;
  displayName?: string;
  roles: string[];
}): Promise<{ data: OperatorUser }> {
  return apiFetch("/api/v1/users", { method: "POST", body: data });
}

export async function updateUserApi(
  userId: string,
  data: { roles?: string[]; email?: string; displayName?: string | null },
): Promise<{ data: OperatorUser }> {
  return apiFetch(`/api/v1/users/${userId}`, { method: "PUT", body: data });
}

export async function deleteUserApi(userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/users/${userId}`, { method: "DELETE" });
}

export async function resetPasswordApi(
  userId: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/users/${userId}/reset-password`, {
    method: "POST",
    body: { newPassword },
  });
}

// ── License ──────────────────────────────────────────────────────────────────

export async function getLicenseStatusApi(): Promise<{ data: LicenseStatus }> {
  return apiFetch("/api/v1/license/status");
}

export async function licenseRefreshApi(): Promise<{
  ok: boolean;
  data: { refreshed: boolean; currentTier: string; valid: boolean; statusMessage: string };
}> {
  return apiFetch("/api/v1/license/refresh", { method: "POST" });
}

export async function billingUpgradeApi(body: {
  plan: string;
  interval: "monthly" | "annually";
}): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  return apiFetch("/api/v1/license/upgrade", { method: "POST", body });
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function getAnalyticsOverviewApi(productId: string) {
  return apiFetch<{ ok: boolean; data: AnalyticsOverview }>(`/api/v1/products/${productId}/analytics/overview`);
}

export async function getAnalyticsCostApi(productId: string) {
  return apiFetch<{ ok: boolean; data: AnalyticsCost }>(`/api/v1/products/${productId}/analytics/cost`);
}

export async function getAnalyticsAgentsApi(productId: string) {
  return apiFetch<{ ok: boolean; data: AnalyticsAgents }>(`/api/v1/products/${productId}/analytics/agents`);
}

export async function getAnalyticsCasesApi(productId: string) {
  return apiFetch<{ ok: boolean; data: AnalyticsCases }>(`/api/v1/products/${productId}/analytics/cases`);
}

export async function getAnalyticsMemoryApi(productId: string) {
  return apiFetch<{ ok: boolean; data: AnalyticsMemory }>(`/api/v1/products/${productId}/analytics/memory`);
}

export async function getAnalyticsOperationsApi(productId: string) {
  return apiFetch<{ ok: boolean; data: AnalyticsOperations }>(`/api/v1/products/${productId}/analytics/operations`);
}

// Analytics types

export interface AnalyticsOverview {
  period: string;
  cases: { total: number; open: number; resolved: number; closed: number; aiResolved: number; automationRate: number };
  tokens: { input: number; output: number; total: number; agentCalls: number; estimatedCostUsd: number };
  changeRequests: number;
  notifications: number;
}

export interface AnalyticsCost {
  breakdown: Array<{
    actionType: string; modelId: string; monthYear: string;
    inputTokens: number; outputTokens: number; totalTokens: number;
    callCount: number; estimatedCostUsd: number; avgTokensPerCall: number;
  }>;
  monthlyTotals: Array<{
    month: string; inputTokens: number; outputTokens: number;
    totalTokens: number; agentCalls: number; estimatedCostUsd: number;
  }>;
}

export interface AnalyticsAgents {
  agents: Record<string, {
    totalRuns: number; successCount: number; errorCount: number; abstainCount: number;
    avgDurationMs: number; totalInputTokens: number; totalOutputTokens: number; successRate: number;
  }>;
  recentErrors: Array<{ id: string; actionType: string; errorCode: string | null; errorMessage: string | null; createdAt: string }>;
}

export interface AnalyticsCases {
  byStatus: Array<{ status: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  bySeverity: Array<{ severity: string; count: number }>;
  daily: Array<{ day: string; created: number; resolved: number }>;
  avgResolutionHours: number | null;
}

export interface AnalyticsMemory {
  totalChunks: number; totalSources: number; embeddedChunks: number;
  embeddingCoverage: number; conflictChunks: number;
  tierDistribution: { t1: number; t2: number; t3: number };
  avgFreshness: number | null;
  bySourceType: Array<{ sourceType: string; count: number }>;
}

export interface AnalyticsOperations {
  approvalResponseTime: { avgHours: number | null };
  queue: {
    currentDepth: number;
    daily: Array<{ day: string; requested: number; acted: number }>;
  };
  rejectionRate: { rate: number; approved: number; rejected: number; total: number };
  manualTriage: { rate: number; manual: number; total: number };
  escalation: { rate: number; escalated: number; totalCases: number };
  firstHumanResponseTime: { avgHours: number | null };
}

// ── Retention (CG-03) ─────────────────────────────────────────────────────────

export interface DeletionSummary {
  caseId: string;
  notificationsDeleted: number;
  signalsDeleted: number;
  conversationsDeleted: number;
  changeRequestsDeleted: number;
  auditEventsAnonymised: number;
  caseDeleted: boolean;
}

export interface RetentionSweepResult {
  retentionDays: number;
  casesFound: number;
  casesDeleted: number;
  errors: number;
  details: DeletionSummary[];
}

export async function deleteCaseApi(
  productId: string,
  caseId: string,
): Promise<{ ok: boolean; data: DeletionSummary }> {
  return apiFetch(`/api/v1/products/${productId}/cases/${caseId}`, { method: "DELETE" });
}

export async function runRetentionSweepApi(
  productId: string,
): Promise<{ ok: boolean; data: RetentionSweepResult }> {
  return apiFetch(`/api/v1/products/${productId}/retention/run`, { method: "POST" });
}

// ── DSAR (CG-04) ──────────────────────────────────────────────────────────────

export interface DsarSummary {
  identities: number;
  cases: number;
  signals: number;
  conversations: number;
  notifications: number;
  auditEvents: number;
  changeRequests: number;
}

export interface DsarSearchResult {
  identity: string;  // canonical (first email found, or raw query)
  query: string;     // original search term
  generatedAt: string;
  summary: DsarSummary;
  data: Record<string, unknown[]>;
}

export async function dsarSearchApi(
  productId: string,
  identity: string,
): Promise<{ ok: boolean; data: DsarSearchResult }> {
  return apiFetch(
    `/api/v1/products/${productId}/dsar/search?identity=${encodeURIComponent(identity)}`,
  );
}

export function dsarExportUrl(
  productId: string,
  identity: string,
  format: "json" | "csv",
): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  return `${base}/api/v1/products/${productId}/dsar/export?identity=${encodeURIComponent(identity)}&format=${format}`;
}

// ─── RBAC Permission Audit (SLICE-22) ────────────────────────────────────────

export interface RoleSummary {
  id: string;
  name: string;
  permissionCount: number;
  type?: "default" | "custom";
}

export interface PermissionWithGrant {
  id: string;
  domain: string;
  action: string;
  label: string;
  description: string;
  destructive: boolean;
  sensitive: boolean;
  granted: boolean;
}

export async function getRolesApi(
  productId: string,
): Promise<{ ok: boolean; data: RoleSummary[] }> {
  return apiFetch(`/api/v1/products/${productId}/roles`);
}

export async function getRolePermissionsApi(
  productId: string,
  roleId: string,
): Promise<{ ok: boolean; data: { roleId: string; permissions: PermissionWithGrant[] } }> {
  return apiFetch(`/api/v1/products/${productId}/roles/${roleId}/permissions`);
}

// ─── Permission Studio (SLICE-23) ────────────────────────────────────────────

export interface CustomRole {
  role_id: string;
  product_id: string;
  name: string;
  key: string;
  description: string;
  cloned_from?: string;
  created_by: string;
  created_at: string;
}

export async function createCustomRoleApi(
  productId: string,
  body: { name: string; key: string; description?: string; clone_from?: string }
): Promise<{ ok: boolean; data: { role_id: string; name: string; key: string } }> {
  return apiFetch(`/api/v1/products/${productId}/roles`, {
    method: "POST",
    body,
  });
}

export async function updateRolePermissionsApi(
  productId: string,
  roleId: string,
  permissions: string[]
): Promise<{ ok: boolean; data: { roleId: string; permissions: string[]; impactPreview: { affectedUsers: string[] } } }> {
  return apiFetch(`/api/v1/products/${productId}/roles/${roleId}/permissions`, {
    method: "PUT",
    body: { permissions },
  });
}

export async function updateCustomRoleApi(
  productId: string,
  roleId: string,
  body: { name?: string; description?: string }
): Promise<{ ok: boolean; data: { role_id: string; name: string } }> {
  return apiFetch(`/api/v1/products/${productId}/roles/${roleId}`, {
    method: "PATCH",
    body,
  });
}

export async function deleteCustomRoleApi(
  productId: string,
  roleId: string
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/v1/products/${productId}/roles/${roleId}`, {
    method: "DELETE",
  });
}

export async function upsertUserPermissionOverrideApi(
  productId: string,
  roleId: string,
  userRef: string,
  body: { permission_id: string; granted: boolean }
): Promise<{ ok: boolean }> {
  return apiFetch(
    `/api/v1/products/${productId}/roles/${roleId}/users/${encodeURIComponent(userRef)}/overrides`,
    { method: "PUT", body }
  );
}

export async function createSsoMappingApi(
  productId: string,
  roleId: string,
  body: { group_name: string }
): Promise<{ ok: boolean; data: { id: number; group_name: string; role_id: string } }> {
  return apiFetch(`/api/v1/products/${productId}/roles/${roleId}/sso-mappings`, {
    method: "POST",
    body,
  });
}

export async function exportRolesApi(
  productId: string
): Promise<{ ok: boolean; data: { exportedAt: string; roles: Array<{ id: string; name: string; type: string; permissions: string[] }> } }> {
  return apiFetch(`/api/v1/products/${productId}/roles/export.json`);
}

// ── Product Memory (SLICE-03 / WAVE-5) ───────────────────────────────────────

export type MemorySourceType =
  | "product_spec" | "feature_spec" | "faq" | "known_issues" | "api_docs"
  | "openapi_spec" | "architecture_overview" | "technical_spec" | "deployment_guide"
  | "troubleshooting_guide" | "runbook" | "changelog" | "readme"
  | "github_issue_filtered" | "github_pr_merged" | "github_issue_raw" | "commit_message";

export interface MemorySource {
  sourceType:     MemorySourceType;
  sourceUri:      string;
  tier:           1 | 2 | 3 | 4;
  chunkCount:     number;
  minFreshness:   string;
  avgFreshness:   string;
  lastIngestedAt: string;
  hasConflicts:   boolean;
}

export interface MemoryStats {
  total_chunks:       number;
  total_sources:      number;
  embedded_chunks:    number;
  conflict_chunks:    number;
  t1_chunks:          number;
  t2_chunks:          number;
  t3_chunks:          number;
  t4_chunks:          number;
  avg_freshness:      string | null;
  earliest_ingestion: string | null;
  latest_ingestion:   string | null;
}

export type HealthLevel = "good" | "warn" | "fail";
export type CapabilityStatus = "enabled" | "degraded" | "disabled";

export interface HealthDimensions {
  t1Coverage:    HealthLevel;
  faqCoverage:   HealthLevel;
  knownIssues:   HealthLevel;
  architecture:  HealthLevel;
  technicalSpec: HealthLevel;
  freshness:     HealthLevel;
  conflicts:     HealthLevel;
  language:      HealthLevel;
}

export interface CapabilityGates {
  autoReply:       CapabilityStatus;
  knownIssueMatch: CapabilityStatus;
  changePrep:      CapabilityStatus;
  prDraft:         CapabilityStatus;
  outageRouting:   CapabilityStatus;
}

export interface MemoryHealthReport {
  reportId:           string;
  productId:          string;
  computedAt:         string;
  dimensions:         HealthDimensions;
  capabilities:       CapabilityGates;
  recommendedActions: string[];
}

export interface MemorySearchChunk {
  chunkId:        string;
  sourceType:     MemorySourceType;
  sourceUri:      string;
  sectionPath:    string;
  content:        string;
  tier:           1 | 2 | 3 | 4;
  freshnessScore: number;
  score:          number;
}

export interface MemorySearchResult {
  chunks:        MemorySearchChunk[];
  abstain:       boolean;
  abstainReason: string | null;
  tierSummary:   Record<string, number>;
  avgFreshness:  number | null;
  hasConflicts:  boolean;
}

export interface IngestMemoryPayload {
  sourceType:           MemorySourceType;
  sourceUri:            string;
  content:              string;
  sourceUpdatedAt:      string;  // ISO datetime
  productVersion?:      string;
  audience?:            "public" | "internal" | "developer";
  language?:            string;
  runConflictDetection?: boolean;
}

export interface IngestMemoryResult {
  chunksIngested: number;
  chunksSkipped:  number;
  totalTokens:    number;
  sourceUri:      string;
  tier:           1 | 2 | 3 | 4;
}

export async function getMemorySourcesApi(
  productId: string,
): Promise<{ ok: boolean; data: { sources: MemorySource[]; totalSources: number } }> {
  return apiFetch(`/api/v1/products/${productId}/memory/sources`);
}

export async function getMemoryStatsApi(
  productId: string,
): Promise<{ ok: boolean; data: MemoryStats }> {
  return apiFetch(`/api/v1/products/${productId}/memory/stats`);
}

export async function getMemoryHealthApi(
  productId: string,
): Promise<{ ok: boolean; data: MemoryHealthReport }> {
  return apiFetch(`/api/v1/products/${productId}/memory/health`);
}

export async function searchMemoryApi(
  productId: string,
  body: { query: string; actionType?: string; topN?: number },
): Promise<{ ok: boolean; data: MemorySearchResult }> {
  return apiFetch(`/api/v1/products/${productId}/memory/search`, {
    method: "POST",
    body,
  });
}

export async function ingestMemoryApi(
  productId: string,
  payload: IngestMemoryPayload,
): Promise<{ ok: boolean; data: IngestMemoryResult }> {
  return apiFetch(`/api/v1/products/${productId}/memory/ingest`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteMemorySourceApi(
  productId: string,
  sourceUri: string,
): Promise<{ ok: boolean; data: { deletedChunks: number } }> {
  return apiFetch(
    `/api/v1/products/${productId}/memory/sources/${encodeURIComponent(sourceUri)}`,
    { method: "DELETE" },
  );
}

// ─── Dashboard (WAVE-4) ──────────────────────────────────────────────────────

export interface DashboardKpis {
  openCases:           number;
  pendingApprovals:    number;
  readyPrDrafts:       number;
  unreadNotifications: number;
}

export interface DashboardActivity {
  id:         string;
  action:     string;
  entityType: string;
  entityRef:  string;
  actorType:  string;
  actorRef:   string;
  occurredAt: string;
}

export interface DashboardData {
  kpis:           DashboardKpis;
  recentActivity: DashboardActivity[];
}

export async function getDashboardApi(productId: string): Promise<DashboardData> {
  return apiFetch(`/api/v1/products/${productId}/dashboard`);
}

// ── Billing ───────────────────────────────────────────────────────────────────

export type BillingPlan = "community" | "starter" | "growth" | "scale";
export type PlanInterval = "monthly" | "annual";

export interface BillingStatus {
  plan:                  BillingPlan;
  planInterval:          PlanInterval | null;
  status:                "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  stripeCustomerId:      string | null;
  stripeSubscriptionId:  string | null;
  trialEndsAt:           string | null;
  currentPeriodEnd:      string | null;
  cancelAt:              string | null;
}

export async function getBillingStatusApi(): Promise<{ data: BillingStatus }> {
  return apiFetch("/api/v1/billing/status");
}

export async function billingCheckoutApi(params: {
  plan: "starter" | "growth";
  interval: PlanInterval;
  success_url: string;
  cancel_url: string;
}): Promise<{ data: { checkout_url: string } }> {
  return apiFetch("/api/v1/billing/checkout", { method: "POST", body: params });
}

export async function billingPortalApi(params: {
  return_url: string;
}): Promise<{ data: { portal_url: string } }> {
  return apiFetch("/api/v1/billing/portal", { method: "POST", body: params });
}

export async function billingDowngradeApi(params: {
  plan: "starter";
  interval: PlanInterval;
}): Promise<{ data: { effective_date: string | null } }> {
  return apiFetch("/api/v1/billing/downgrade", { method: "POST", body: params });
}

// ── Registration ──────────────────────────────────────────────────────────────

export async function registerApi(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ data: { token: string; user: { userId: string; email: string; roles: string[]; productIds: string[] } } }> {
  return apiFetch("/api/v1/auth/register", { method: "POST", body: params, skipAuth: true });
}

// ── Channels status (FEAT-002) ────────────────────────────────────────────────

export interface ChannelStatusInfo {
  status:      "connected" | "no_events" | "not_configured"
  lastEventAt: string | null
}

export async function getChannelStatusApi(
  productId: string,
): Promise<{ ok: boolean; channels: Record<string, ChannelStatusInfo> }> {
  return apiFetch(`/api/v1/products/${productId}/channels/status`)
}
