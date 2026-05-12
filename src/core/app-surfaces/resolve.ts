import "server-only";
import { createServiceRoleClient } from "@/core/auth/service-role";

export type SurfaceType = "admin" | "customer" | "role";

export type DomainResolution = {
  kind: "domain";
  domain: string;
};

export type EnvFallbackResolution = {
  kind: "env_fallback";
  reason: "localhost" | "vercel_preview" | "no_host";
  businessSlug: string;
  surfaceSlug: string;
};

export type ResolvedAppSurface = {
  business: {
    id: string;
    slug: string;
    name: string;
  };
  appSurface: {
    id: string;
    slug: string;
    name: string;
    surfaceType: SurfaceType;
    status: string;
  };
  resolution: DomainResolution | EnvFallbackResolution;
};

function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const withoutPort = host.split(":")[0];
  if (!withoutPort) return null;
  return withoutPort.toLowerCase();
}

function isLocalhost(normalizedHost: string): boolean {
  return (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "0.0.0.0" ||
    normalizedHost === "::1"
  );
}

function isVercelPreview(normalizedHost: string): boolean {
  // Vercel preview URLs look like <project>-<hash>-<owner>.vercel.app
  // Production aliases on *.vercel.app also fit here; treat both as preview
  // for resolution purposes. Real custom production domains are configured
  // in app_surface_domains.
  return normalizedHost.endsWith(".vercel.app");
}

async function fetchBusinessAndSurface(
  businessId: string,
  surfaceId: string,
): Promise<Pick<ResolvedAppSurface, "business" | "appSurface"> | null> {
  const supabase = createServiceRoleClient();

  const [businessRes, surfaceRes] = await Promise.all([
    supabase
      .from("businesses")
      .select("id, slug, name")
      .eq("id", businessId)
      .single(),
    supabase
      .from("app_surfaces")
      .select("id, slug, name, surface_type, status")
      .eq("id", surfaceId)
      .single(),
  ]);

  if (businessRes.error || !businessRes.data) return null;
  if (surfaceRes.error || !surfaceRes.data) return null;

  return {
    business: {
      id: businessRes.data.id,
      slug: businessRes.data.slug,
      name: businessRes.data.name,
    },
    appSurface: {
      id: surfaceRes.data.id,
      slug: surfaceRes.data.slug,
      name: surfaceRes.data.name,
      surfaceType: surfaceRes.data.surface_type as SurfaceType,
      status: surfaceRes.data.status,
    },
  };
}

async function fetchBusinessAndSurfaceBySlug(
  businessSlug: string,
  surfaceSlug: string,
): Promise<Pick<ResolvedAppSurface, "business" | "appSurface"> | null> {
  const supabase = createServiceRoleClient();

  const { data: business, error: businessErr } = await supabase
    .from("businesses")
    .select("id, slug, name")
    .eq("slug", businessSlug)
    .maybeSingle();

  if (businessErr || !business) return null;

  const { data: surface, error: surfaceErr } = await supabase
    .from("app_surfaces")
    .select("id, slug, name, surface_type, status")
    .eq("business_id", business.id)
    .eq("slug", surfaceSlug)
    .maybeSingle();

  if (surfaceErr || !surface) return null;

  return {
    business: {
      id: business.id,
      slug: business.slug,
      name: business.name,
    },
    appSurface: {
      id: surface.id,
      slug: surface.slug,
      name: surface.name,
      surfaceType: surface.surface_type as SurfaceType,
      status: surface.status,
    },
  };
}

// Try to resolve an active domain mapping for the given host. Returns null
// if no active mapping exists. The result includes the business + app
// surface the domain is mapped to.
async function tryDomainResolution(
  normalizedHost: string,
): Promise<ResolvedAppSurface | null> {
  const supabase = createServiceRoleClient();

  const { data: domainRow, error } = await supabase
    .from("app_surface_domains")
    .select("id, domain, status, business_id, app_surface_id")
    .eq("domain", normalizedHost)
    .eq("status", "active")
    .maybeSingle();

  if (error || !domainRow) return null;

  const joined = await fetchBusinessAndSurface(
    domainRow.business_id,
    domainRow.app_surface_id,
  );
  if (!joined) return null;

  return {
    ...joined,
    resolution: { kind: "domain", domain: domainRow.domain },
  };
}

// Resolve a customer-facing app surface for an inbound request host.
//
// Strategy:
//   1. If the host has an active row in app_surface_domains, use the
//      business + surface from that mapping (regardless of which slug is
//      configured in the env).
//   2. If the host is localhost / Vercel preview / missing, fall back to
//      DEFAULT_BUSINESS_SLUG + DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG.
//   3. Otherwise return null (unknown production host with no mapping).
export async function resolveCustomerSurfaceByHost(
  host: string | null | undefined,
): Promise<ResolvedAppSurface | null> {
  const normalizedHost = normalizeHost(host);

  if (normalizedHost) {
    const domainResult = await tryDomainResolution(normalizedHost);
    if (domainResult) return domainResult;
  }

  const isFallbackEligible =
    !normalizedHost ||
    isLocalhost(normalizedHost) ||
    isVercelPreview(normalizedHost);

  if (!isFallbackEligible) {
    return null;
  }

  const businessSlug = process.env.DEFAULT_BUSINESS_SLUG ?? "crystal-bear";
  const surfaceSlug =
    process.env.DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG ?? "quote";

  const joined = await fetchBusinessAndSurfaceBySlug(
    businessSlug,
    surfaceSlug,
  );
  if (!joined) return null;

  const reason: EnvFallbackResolution["reason"] = !normalizedHost
    ? "no_host"
    : isLocalhost(normalizedHost)
      ? "localhost"
      : "vercel_preview";

  return {
    ...joined,
    resolution: {
      kind: "env_fallback",
      reason,
      businessSlug,
      surfaceSlug,
    },
  };
}
