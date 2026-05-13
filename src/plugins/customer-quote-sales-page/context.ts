import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { CUSTOMER_QUOTE_SALES_PAGE } from "./manifest";
import type { CustomerQuotePageContext } from "./types";

// =========================================================================
// Loads everything the public /q page needs: business identity, app
// surface identity, customer-facing copy from business_settings, and
// (optionally) the installed_plugin_id so quote_page_interactions rows
// can trace back to which plugin install produced them.
//
// Public-flow primitive — uses service-role since the underlying tables
// are RLS-locked to authenticated members.
// =========================================================================

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  phone: string | null;
};

type AppSurfaceRow = {
  id: string;
  slug: string;
  name: string;
};

type InstalledPluginRow = {
  id: string;
  installed_version: string;
};

type BusinessSettingRow = {
  key: string;
  value: unknown;
};

const COPY_DEFAULTS: CustomerQuotePageContext["copy"] = {
  fallback_property_data_missing:
    "We don't have your home in our system yet! Enter your contact information and our team will send you a quote as soon as it's ready.",
  fallback_out_of_service_area:
    "Looks like this address may be outside our current service area. Enter your contact information and our team will let you know if we can help.",
  customer_quote_trust_points: [
    "Exterior window cleaning",
    "Free screen cleaning included",
    "Spotless guarantee",
    "Fast turnaround",
    "Owner-operated service",
    "Eco-friendly cleaning",
  ],
  customer_quote_scheduling_copy:
    "Choose your cleaning option and request scheduling. We'll follow up to confirm the soonest available time.",
  customer_quote_phone_secondary: "Prefer to talk? Call us.",
};

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string");
}

function mergeCopy(
  rows: BusinessSettingRow[],
): CustomerQuotePageContext["copy"] {
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    fallback_property_data_missing:
      asString(map.fallback_property_data_missing) ??
      COPY_DEFAULTS.fallback_property_data_missing,
    fallback_out_of_service_area:
      asString(map.fallback_out_of_service_area) ??
      COPY_DEFAULTS.fallback_out_of_service_area,
    customer_quote_trust_points:
      asStringArray(map.customer_quote_trust_points) ??
      COPY_DEFAULTS.customer_quote_trust_points,
    customer_quote_scheduling_copy:
      asString(map.customer_quote_scheduling_copy) ??
      COPY_DEFAULTS.customer_quote_scheduling_copy,
    customer_quote_phone_secondary:
      asString(map.customer_quote_phone_secondary) ??
      COPY_DEFAULTS.customer_quote_phone_secondary,
  };
}

export async function loadCustomerQuotePageContext(input: {
  businessId: string;
  appSurfaceId: string;
}): Promise<
  | { ok: true; data: CustomerQuotePageContext }
  | { ok: false; error: { code: string; message: string } }
> {
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

  const [businessRes, surfaceRes, installedRes, settingsRes] =
    await Promise.all([
      supabase
        .from("businesses")
        .select("id, slug, name, phone")
        .eq("id", input.businessId)
        .maybeSingle(),
      supabase
        .from("app_surfaces")
        .select("id, slug, name")
        .eq("id", input.appSurfaceId)
        .maybeSingle(),
      supabase
        .from("installed_plugins")
        .select("id, installed_version, status")
        .eq("business_id", input.businessId)
        .eq("plugin_key", CUSTOMER_QUOTE_SALES_PAGE.pluginKey)
        .eq("status", "enabled")
        .maybeSingle(),
      supabase
        .from("business_settings")
        .select("key, value")
        .eq("business_id", input.businessId)
        .in("key", [
          "fallback_property_data_missing",
          "fallback_out_of_service_area",
          "customer_quote_trust_points",
          "customer_quote_scheduling_copy",
          "customer_quote_phone_secondary",
        ]),
    ]);

  if (businessRes.error || !businessRes.data) {
    return {
      ok: false,
      error: {
        code: "BUSINESS_NOT_FOUND",
        message: businessRes.error?.message ?? "Business not found.",
      },
    };
  }
  if (surfaceRes.error || !surfaceRes.data) {
    return {
      ok: false,
      error: {
        code: "APP_SURFACE_NOT_FOUND",
        message: surfaceRes.error?.message ?? "App surface not found.",
      },
    };
  }

  const business = businessRes.data as BusinessRow;
  const surface = surfaceRes.data as AppSurfaceRow;
  const installed = installedRes.data as InstalledPluginRow | null;
  const settingRows = (settingsRes.data ?? []) as BusinessSettingRow[];

  return {
    ok: true,
    data: {
      business: {
        id: business.id,
        slug: business.slug,
        name: business.name,
        phone: business.phone ?? null,
      },
      appSurface: {
        id: surface.id,
        slug: surface.slug,
        name: surface.name,
      },
      installedPluginId: installed?.id ?? null,
      pluginVersion:
        installed?.installed_version ?? CUSTOMER_QUOTE_SALES_PAGE.version,
      copy: mergeCopy(settingRows),
    },
  };
}
