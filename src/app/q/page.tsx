import { headers } from "next/headers";
import { resolveCustomerSurfaceByHost } from "@/core/app-surfaces/resolve";
import { loadCustomerQuotePageContext } from "@/plugins/customer-quote-sales-page";
import { QuoteFlowClient } from "./quote-flow-client";

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
      </main>
    );
  }

  const context = await loadCustomerQuotePageContext({
    businessId: resolved.business.id,
    appSurfaceId: resolved.appSurface.id,
  });
  if (!context.ok) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold">Surface configuration error</h1>
        <p className="mt-3 text-sm text-gray-700">{context.error.message}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6 sm:p-10 space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900">
            {context.data.business.name}
          </h1>
          <p className="text-sm text-gray-600">
            Crystal-clean windows, no callbacks. Free screen cleaning included.
          </p>
        </header>

        <QuoteFlowClient context={context.data} />

        <footer className="text-[11px] text-gray-400 text-center pt-4 border-t">
          Phase 1 preview · {context.data.appSurface.name} · plugin
          {" "}{context.data.pluginVersion}
        </footer>
      </div>
    </main>
  );
}
