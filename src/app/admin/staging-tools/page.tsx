import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { readStagingToolsGate } from "@/core/staging-tools/env";
import {
  PRESERVED_TABLES,
  buildResetPlan,
} from "@/core/staging-tools/plan";
import { ResetButtonClient } from "./reset-button-client";

export const dynamic = "force-dynamic";

export default async function StagingToolsPage() {
  // First gate: the public flag controls whether the page even renders.
  // The server action enforces ENABLE_STAGING_TOOLS independently, so
  // even if someone navigates directly here in prod the action refuses.
  const gate = readStagingToolsGate(process.env);
  if (!gate.publicEnabled) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const plan = buildResetPlan({ businessId: business.id });

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Staging tools</h1>
        <p className="text-sm text-gray-600 mt-1">
          {business.name} · {user.email}
        </p>
        <div className="mt-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-wide">
          <span
            className={`px-2 py-0.5 rounded ${
              gate.publicEnabled
                ? "bg-amber-100 text-amber-900"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            NEXT_PUBLIC_ENABLE_STAGING_TOOLS:{" "}
            {gate.publicEnabled ? "true" : "false"}
          </span>
          <span
            className={`px-2 py-0.5 rounded ${
              gate.serverEnabled
                ? "bg-amber-100 text-amber-900"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            ENABLE_STAGING_TOOLS:{" "}
            {gate.serverEnabled ? "true" : "false"}
          </span>
        </div>
      </header>

      {!gate.serverEnabled && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Server gate is OFF.</p>
          <p className="mt-1">
            The page rendered because{" "}
            <code>NEXT_PUBLIC_ENABLE_STAGING_TOOLS</code> is true, but the
            action will refuse until <code>ENABLE_STAGING_TOOLS</code> is
            also true on the server. Restart the dev server after editing{" "}
            <code>.env.local</code>.
          </p>
        </div>
      )}

      <section className="mb-6">
        <h2 className="text-base font-medium text-gray-900">
          What gets deleted
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Quote-flow test data only. The reset is scoped to{" "}
          <code className="text-xs">{business.name}</code> by{" "}
          <code className="text-xs">business_id</code> plus a plugin / source
          filter on every table.
        </p>
        <ul className="mt-3 space-y-1 text-xs font-mono">
          {plan.steps.map((step) => (
            <li
              key={step.table}
              className="rounded border bg-white p-2 break-all"
            >
              <span className="font-semibold">{step.table}</span>
              <span className="text-gray-500"> — where {step.description}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-gray-500">
          {plan.notes.join(" · ")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-base font-medium text-gray-900">
          What is preserved
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Every setup table the workspace depends on stays intact:
        </p>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] font-mono text-gray-700">
          {PRESERVED_TABLES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-medium text-gray-900 mb-3">
          Run reset
        </h2>
        <ResetButtonClient />
      </section>

      <p className="mt-10 text-[11px] text-gray-500">
        Never set <code>ENABLE_STAGING_TOOLS</code> or{" "}
        <code>NEXT_PUBLIC_ENABLE_STAGING_TOOLS</code> to <code>true</code>{" "}
        in production.
      </p>
    </main>
  );
}
