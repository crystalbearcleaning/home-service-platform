import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import type { GeoResult, ServiceAreaMatch } from "./types";

// Pure helper — exported so tests can verify it without DB access.
export function normalizeCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function matchServiceArea(
  businessId: string,
  city: string,
): Promise<GeoResult<ServiceAreaMatch>> {
  const normalized = normalizeCity(city);
  if (!normalized) {
    return {
      ok: false,
      error: { code: "EMPTY_CITY", message: "City is empty after normalization." },
    };
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CLIENT_INIT_FAILED",
        message:
          err instanceof Error
            ? err.message
            : "Service-role Supabase client init failed.",
      },
    };
  }

  const { data, error } = await supabase
    .from("service_areas")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("status", "active")
    .eq("match_type", "city")
    .eq("match_value", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: error.message },
    };
  }

  if (data) {
    return {
      ok: true,
      data: {
        inArea: true,
        serviceAreaId: data.id,
        serviceAreaName: data.name,
        normalizedCity: normalized,
        reason: null,
      },
    };
  }

  return {
    ok: true,
    data: {
      inArea: false,
      serviceAreaId: null,
      serviceAreaName: null,
      normalizedCity: normalized,
      reason: `No active service area for city "${city}".`,
    },
  };
}
