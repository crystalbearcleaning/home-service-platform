"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  createCampaign,
  createDesign,
  createDistributionSession,
  createManualRoute,
} from "@/core/door-hanger/admin-create";
import {
  minutesToSeconds,
  parseDollarsToCents,
} from "@/core/door-hanger/calculations";
import {
  generateRoutePreview,
  saveRentcastRoute,
} from "@/core/door-hanger/rentcast-route";
import type { CandidatePreview } from "@/core/door-hanger/rentcast-candidates";
import {
  DOOR_HANGER_ROUTE_STATUSES,
  type DoorHangerRouteStatus,
} from "@/plugins/door-hanger";

// =========================================================================
// Phase 5B-2 Door Hanger admin server actions.
// Auth + business-scoped; service-role writes via the core helpers.
// Create-only — no edit / delete / archive flows.
// =========================================================================

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string>;
      };
    };

async function requireBusiness(): Promise<
  { ok: true; userId: string; businessId: string } | Result<never>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Sign-in required." } };
  }
  const business = await getActiveBusinessForUser(user.id);
  if (!business) {
    return {
      ok: false,
      error: { code: "NO_ACTIVE_BUSINESS", message: "No active business." },
    };
  }
  return { ok: true, userId: user.id, businessId: business.id };
}

function revalidate() {
  revalidatePath("/admin/marketing/door-hangers");
}

// -------------------------------------------------------------------------
// Campaign
// -------------------------------------------------------------------------
export async function createCampaignAction(input: {
  name: string;
  offerSummary?: string | null;
  targetArea?: string | null;
  status?: string | null;
  responseRateAssumption?: number | null;
  quoteToBookingAssumption?: number | null;
  averageJobValueDollars?: string | null;
  notes?: string | null;
}): Promise<Result<{ campaignId: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  // Convert dollars → cents at the boundary.
  const moneyParse = parseDollarsToCents(input.averageJobValueDollars ?? null);
  if (!moneyParse.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Average job value is invalid.",
        fieldErrors: { averageJobValueDollars: "Enter a non-negative dollar amount." },
      },
    };
  }

  const result = await createCampaign({
    businessId: auth.businessId,
    form: {
      name: input.name,
      offerSummary: input.offerSummary ?? null,
      targetArea: input.targetArea ?? null,
      status: input.status ?? null,
      responseRateAssumption: input.responseRateAssumption ?? null,
      quoteToBookingAssumption: input.quoteToBookingAssumption ?? null,
      averageJobValueCents: moneyParse.cents,
      notes: input.notes ?? null,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true, data: result.data };
}

// -------------------------------------------------------------------------
// Design / inventory
// -------------------------------------------------------------------------
export async function createDesignAction(input: {
  name: string;
  versionOrOffer?: string | null;
  quantityReceived: number;
  totalPrintCostDollars?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
}): Promise<Result<{ designId: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const moneyParse = parseDollarsToCents(input.totalPrintCostDollars ?? null);
  if (!moneyParse.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Total print cost is invalid.",
        fieldErrors: { totalPrintCostDollars: "Enter a non-negative dollar amount." },
      },
    };
  }

  const result = await createDesign({
    businessId: auth.businessId,
    form: {
      name: input.name,
      versionOrOffer: input.versionOrOffer ?? null,
      quantityReceived: input.quantityReceived,
      totalPrintCostCents: moneyParse.cents,
      receivedAt: input.receivedAt ?? null,
      notes: input.notes ?? null,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true, data: result.data };
}

// -------------------------------------------------------------------------
// Manual route shell
// -------------------------------------------------------------------------
export async function createManualRouteAction(input: {
  name: string;
  campaignId?: string | null;
  centerAddress?: string | null;
  radiusMiles?: number | null;
  targetHomeCount?: number | null;
  estimatedTimeMinutes?: string | null;
  status?: string | null;
  notes?: string | null;
}): Promise<Result<{ routeId: string }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const timeParse = minutesToSeconds(input.estimatedTimeMinutes ?? null);
  if (!timeParse.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Estimated time is invalid.",
        fieldErrors: { estimatedTimeMinutes: "Enter a non-negative number of minutes." },
      },
    };
  }

  const result = await createManualRoute({
    businessId: auth.businessId,
    form: {
      name: input.name,
      campaignId: input.campaignId ?? null,
      centerAddress: input.centerAddress ?? null,
      radiusMiles: input.radiusMiles ?? null,
      targetHomeCount: input.targetHomeCount ?? null,
      estimatedTimeSeconds: timeParse.seconds,
      status: input.status ?? null,
      notes: input.notes ?? null,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true, data: result.data };
}

// -------------------------------------------------------------------------
// Distribution session
// -------------------------------------------------------------------------
export async function createDistributionSessionAction(input: {
  campaignId: string;
  routeId: string;
  designId: string;
  distributedAt: string;
  hangersDistributed: number;
  timeSpentMinutes?: string | null;
  notes?: string | null;
}): Promise<
  Result<{
    sessionId: string;
    materialCostCents: number | null;
    newQuantityUsed: number;
    newQuantityRemaining: number;
  }>
> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const timeParse = minutesToSeconds(input.timeSpentMinutes ?? null);
  if (!timeParse.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Time spent is invalid.",
        fieldErrors: { timeSpentMinutes: "Enter a non-negative number of minutes." },
      },
    };
  }

  const result = await createDistributionSession({
    businessId: auth.businessId,
    form: {
      campaignId: input.campaignId,
      routeId: input.routeId,
      designId: input.designId,
      distributedAt: input.distributedAt,
      hangersDistributed: input.hangersDistributed,
      timeSpentSeconds: timeParse.seconds,
      notes: input.notes ?? null,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true, data: result.data };
}

// -------------------------------------------------------------------------
// RentCast route generation (Phase 5C) — preview + save.
// Preview fires ONE RentCast batch search. Save makes zero RentCast calls.
// -------------------------------------------------------------------------
export async function previewRentcastRouteAction(input: {
  centerPlaceId: string;
  radiusMiles: number;
  targetHomeCount: number;
  propertyType?: string | null;
}): Promise<
  Result<{
    centerAddress: string;
    centerLatitude: number;
    centerLongitude: number;
    radiusMiles: number;
    targetHomeCount: number;
    propertyType: string | null;
    candidates: CandidatePreview[];
    estimatedRentcastRequests: 1;
  }>
> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const result = await generateRoutePreview({
    centerPlaceId: input.centerPlaceId,
    radiusMiles: input.radiusMiles,
    targetHomeCount: input.targetHomeCount,
    propertyType: input.propertyType ?? null,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: result.data };
}

export async function saveRentcastRouteAction(input: {
  name: string;
  campaignId?: string | null;
  notes?: string | null;
  status?: string | null;
  centerAddress: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusMiles: number;
  targetHomeCount: number;
  candidates: CandidatePreview[];
}): Promise<Result<{ routeId: string; totalRouteStops: number }>> {
  const auth = await requireBusiness();
  if (!auth.ok) return auth;

  const status: DoorHangerRouteStatus =
    input.status &&
    (DOOR_HANGER_ROUTE_STATUSES as readonly string[]).includes(input.status)
      ? (input.status as DoorHangerRouteStatus)
      : "draft";

  const result = await saveRentcastRoute({
    businessId: auth.businessId,
    name: input.name,
    campaignId: input.campaignId ?? null,
    centerAddress: input.centerAddress,
    centerLatitude: input.centerLatitude,
    centerLongitude: input.centerLongitude,
    radiusMiles: input.radiusMiles,
    targetHomeCount: input.targetHomeCount,
    status,
    notes: input.notes ?? null,
    candidates: input.candidates,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true, data: result.data };
}
