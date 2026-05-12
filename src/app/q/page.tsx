import { headers } from "next/headers";
import { resolveCustomerSurfaceByHost } from "@/core/app-surfaces/resolve";

export const dynamic = "force-dynamic";

export default async function CustomerQuoteSurfacePage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const resolved = await resolveCustomerSurfaceByHost(host);

  if (!resolved) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold">Surface not found</h1>
        <p className="mt-3 text-sm text-gray-700">
          No customer quote app surface could be resolved for host{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">
            {host ?? "(none)"}
          </code>
          .
        </p>
        <ul className="mt-4 text-sm text-gray-700 list-disc list-inside space-y-1">
          <li>
            Confirm <code>DEFAULT_BUSINESS_SLUG</code> and{" "}
            <code>DEFAULT_CUSTOMER_QUOTE_SURFACE_SLUG</code> are set in{" "}
            <code>.env.local</code>.
          </li>
          <li>
            Confirm the seed has been run (
            <code>./supabase/seed/run_seed.sh</code>).
          </li>
          <li>
            For a real production host, add an active row to{" "}
            <code>app_surface_domains</code>.
          </li>
        </ul>
      </main>
    );
  }

  const resolutionLabel =
    resolved.resolution.kind === "domain"
      ? `Domain mapping (${resolved.resolution.domain})`
      : `Env fallback (${resolved.resolution.reason})`;

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold">{resolved.business.name}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {resolved.appSurface.name}
        </p>
      </header>

      <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card label="Business slug" value={resolved.business.slug} />
        <Card label="Surface slug" value={resolved.appSurface.slug} />
        <Card label="Surface type" value={resolved.appSurface.surfaceType} />
        <Card label="Surface status" value={resolved.appSurface.status} />
        <Card label="Resolved via" value={resolutionLabel} />
        <Card label="Request host" value={host ?? "(none)"} />
      </section>

      <div className="mt-10 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6">
        <p className="text-sm text-gray-700">
          Customer Quote App Surface placeholder — quote flow will be built
          later.
        </p>
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-base font-medium mt-1 break-all">{value}</div>
    </div>
  );
}
