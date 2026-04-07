/**
 * Typed fetch wrappers for the NestFleet owner admin API.
 * All functions require an authenticated owner JWT.
 */

import { apiFetch } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OwnerMeResponse {
  ok: boolean;
  isOwner: boolean;
}

export interface WeekSeries {
  weekLabel: string;
  newSubs: number;
  churned: number;
}

export interface RevenueData {
  mrrCents: number;
  arrCents: number;
  paidCount: number;
  trialCount: number;
  churn30d: number;
  weeklySeries: WeekSeries[];
}

export interface RevenueResponse {
  ok: boolean;
  data: RevenueData;
}

export interface CohortWeek {
  weekLabel: string;
  trialStarts: number;
  converted: number;
}

export interface CohortsResponse {
  ok: boolean;
  data: CohortWeek[];
}

export type ProvisioningStatus =
  | "pending"
  | "provisioning"
  | "active"
  | "failed"
  | "deprovisioning"
  | "deprovisioned";

export interface Provisioning {
  id: string;
  org_slug: string;
  customer_email: string;
  plan: string;
  status: ProvisioningStatus;
  hetzner_server_ip: string | null;
  provisioned_at: string | null;
  last_health_check_at: string | null;
  last_health_status: string | null;
  error_message: string | null;
  created_at: string;
}

export interface FleetResponse {
  ok: boolean;
  data: Provisioning[];
  total: number;
  limit: number;
  offset: number;
}

export interface FleetItemResponse {
  ok: boolean;
  data: Provisioning;
}

export interface ActionResponse {
  ok: boolean;
  message: string;
}

// ─── Fleet query options ──────────────────────────────────────────────────────

export interface FleetQueryOpts {
  limit?: number;
  offset?: number;
  status?: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getOwnerMeApi(): Promise<OwnerMeResponse> {
  return apiFetch<OwnerMeResponse>("/api/v1/owner/me");
}

export async function getOwnerRevenueApi(): Promise<RevenueResponse> {
  return apiFetch<RevenueResponse>("/api/v1/owner/revenue");
}

export async function getOwnerCohortsApi(): Promise<CohortsResponse> {
  return apiFetch<CohortsResponse>("/api/v1/owner/cohorts");
}

export async function getOwnerFleetApi(
  opts: FleetQueryOpts = {}
): Promise<FleetResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  if (opts.status) params.set("status", opts.status);
  const qs = params.toString();
  return apiFetch<FleetResponse>(`/api/v1/owner/fleet${qs ? `?${qs}` : ""}`);
}

export async function getOwnerFleetItemApi(
  slug: string
): Promise<FleetItemResponse> {
  return apiFetch<FleetItemResponse>(`/api/v1/owner/fleet/${slug}`);
}

export async function postOwnerFleetResetApi(
  slug: string
): Promise<ActionResponse> {
  return apiFetch<ActionResponse>(`/api/v1/owner/fleet/${slug}/reset`, {
    method: "POST",
  });
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export interface VersionBucket {
  version: string;
  count: number;
}

export interface InstanceRecord {
  instanceId: string;
  lastSeenAt: string;
}

export interface TelemetryData {
  activeInstances: number;
  versionDistribution: VersionBucket[];
  instances: InstanceRecord[];
  since: string;
}

export interface TelemetryResponse {
  ok: boolean;
  data: TelemetryData;
}

export async function getOwnerTelemetryApi(): Promise<TelemetryResponse> {
  return apiFetch<TelemetryResponse>("/api/v1/owner/telemetry");
}

export interface DeprovisionOpts {
  immediate?: boolean;
  graceDays?: number;
}

export async function postOwnerFleetDeprovisionApi(
  slug: string,
  opts: DeprovisionOpts
): Promise<ActionResponse> {
  return apiFetch<ActionResponse>(`/api/v1/owner/fleet/${slug}/deprovision`, {
    method: "POST",
    body: opts,
  });
}
