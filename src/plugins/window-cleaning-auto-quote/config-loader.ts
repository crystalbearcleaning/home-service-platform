import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";
import { parsePriceRules } from "./pricing";
import type {
  AutoQuoteResult,
  LoadedConfig,
  LoadedService,
  LoadedServicePlan,
} from "./types";

// =========================================================================
// Server-only: load the Auto-Quote Plugin's configuration from the core
// DB tables seeded in step A3:
//
//   services        (EXT_WINDOW base, INT_WINDOW add-on)
//   service_plans   (one_time, six_month, three_month)
//   price_rules     (six rules — see pricing.REQUIRED_PRICE_RULE_KEYS)
//
// Returns a fully-typed LoadedConfig or a structured AutoQuoteError.
// =========================================================================

type RawService = {
  id: string;
  service_code: string;
  name: string;
  is_base_service: boolean;
  is_add_on: boolean;
};

type RawServicePlan = {
  id: string;
  key: string;
  name: string;
  display_label: string;
  frequency_months: number | null;
  is_recommended: boolean;
  sort_order: number;
  is_active: boolean;
};

type RawPriceRule = {
  key: string;
  rule_type: string;
  rule_config: unknown;
  is_active: boolean;
};

export type LoadConfigOk = { ok: true; config: LoadedConfig };
export type LoadConfigErr = Extract<AutoQuoteResult, { ok: false }>;

export async function loadAutoQuoteConfig(
  businessId: string,
): Promise<LoadConfigOk | LoadConfigErr> {
  if (!businessId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "businessId is required." },
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

  const [servicesRes, plansRes, rulesRes] = await Promise.all([
    supabase
      .from("services")
      .select("id, service_code, name, is_base_service, is_add_on")
      .eq("business_id", businessId)
      .eq("is_active", true),
    supabase
      .from("service_plans")
      .select(
        "id, key, name, display_label, frequency_months, is_recommended, sort_order, is_active",
      )
      .eq("business_id", businessId)
      .eq("is_active", true),
    supabase
      .from("price_rules")
      .select("key, rule_type, rule_config, is_active")
      .eq("business_id", businessId)
      .eq("is_active", true),
  ]);

  if (servicesRes.error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: servicesRes.error.message },
    };
  }
  if (plansRes.error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: plansRes.error.message },
    };
  }
  if (rulesRes.error) {
    return {
      ok: false,
      error: { code: "DB_ERROR", message: rulesRes.error.message },
    };
  }

  const services = (servicesRes.data ?? []) as RawService[];
  const plans = (plansRes.data ?? []) as RawServicePlan[];
  const rules = (rulesRes.data ?? []) as RawPriceRule[];

  const exterior = services.find((s) => s.service_code === "EXT_WINDOW");
  if (!exterior) {
    return {
      ok: false,
      error: {
        code: "MISSING_SERVICE",
        message: "Exterior Window Cleaning (EXT_WINDOW) service not found.",
      },
    };
  }
  const interior = services.find((s) => s.service_code === "INT_WINDOW");
  if (!interior) {
    return {
      ok: false,
      error: {
        code: "MISSING_SERVICE",
        message: "Interior Window Cleaning (INT_WINDOW) service not found.",
      },
    };
  }

  const oneTime = plans.find((p) => p.key === "one_time");
  const sixMonth = plans.find((p) => p.key === "six_month");
  const threeMonth = plans.find((p) => p.key === "three_month");
  for (const [key, plan] of Object.entries({
    one_time: oneTime,
    six_month: sixMonth,
    three_month: threeMonth,
  })) {
    if (!plan) {
      return {
        ok: false,
        error: {
          code: "MISSING_SERVICE_PLAN",
          message: `service_plan with key "${key}" not found.`,
        },
      };
    }
  }

  const parsed = parsePriceRules(rules);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: parsed.missingKeys ? "MISSING_PRICE_RULE" : "MALFORMED_PRICE_RULE",
        message: parsed.error,
        details: parsed.missingKeys
          ? { missingKeys: parsed.missingKeys }
          : undefined,
      },
    };
  }

  const toLoadedService = (row: RawService): LoadedService => ({
    id: row.id,
    service_code: row.service_code,
    name: row.name,
    is_base_service: row.is_base_service,
    is_add_on: row.is_add_on,
  });

  const toLoadedPlan = (row: RawServicePlan): LoadedServicePlan => ({
    id: row.id,
    key: row.key,
    name: row.name,
    display_label: row.display_label,
    frequency_months: row.frequency_months,
    is_recommended: row.is_recommended,
    sort_order: row.sort_order,
  });

  return {
    ok: true,
    config: {
      pricing: parsed.config,
      services: {
        exterior: toLoadedService(exterior),
        interior: toLoadedService(interior),
      },
      plans: {
        one_time: toLoadedPlan(oneTime!),
        six_month: toLoadedPlan(sixMonth!),
        three_month: toLoadedPlan(threeMonth!),
      },
      priceRulesUsed: rules.map((r) => r.key).sort(),
    },
  };
}
