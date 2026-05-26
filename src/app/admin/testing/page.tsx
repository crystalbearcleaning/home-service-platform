import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import {
  AdminShell,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
  renderWorkspaceSwitcher,
  renderSimulationBanner,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";

export const dynamic = "force-dynamic";

// =========================================================================
// /admin/testing — Phase 2 testing-tools hub. Links to each internal
// test page. Individual test routes intentionally do NOT appear in the
// sidebar; this hub is the canonical entry. Direct URLs still work.
// =========================================================================

type TestTool = {
  href: string;
  title: string;
  description: string;
  scope: string;
};

const TOOLS: TestTool[] = [
  {
    href: "/admin/geo-test",
    title: "Geo test",
    description:
      "Try Google address normalization and check service-area matching for any address.",
    scope: "Reads service_areas. Hits Google Places. No business writes.",
  },
  {
    href: "/admin/property-data-test",
    title: "Property data test",
    description:
      "Run a RentCast property-data lookup for a given address and inspect the normalized result.",
    scope: "Reads service_areas. Hits Google + RentCast. No business writes.",
  },
  {
    href: "/admin/auto-quote-test",
    title: "Auto-Quote test",
    description:
      "Run the full Auto-Quote calculation end-to-end using live Google + RentCast + pricing rules.",
    scope:
      "Reads service_areas / services / service_plans / price_rules. No business writes.",
  },
  {
    href: "/admin/rate-limit-test",
    title: "Rate limit test",
    description:
      "Exercise the rate-limiter (check + record) without touching any business tables.",
    scope: "Writes rate_limit_events only.",
  },
  {
    href: "/admin/testing/message-sms",
    title: "Message SMS test",
    description:
      "Send one internal test SMS through the GoHighLevel adapter and watch the notification log transition pending → sent / failed.",
    scope:
      "Writes notification_logs only. Requires SEED_NOTIFICATION_PHONE_E164 + GHL_* env to actually send.",
  },
];

export default async function TestingHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const shell = await resolveAdminShellContext({
    business,
    userId: user.id,
    userEmail: user.email ?? "—",
  });

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
      workspaceSwitcherSlot={renderWorkspaceSwitcher(shell)}
      simulationBannerSlot={renderSimulationBanner(shell)}
    >
      <PageHeader
        eyebrow="Tools"
        title="Testing tools"
        description="Internal utilities for sanity-checking platform providers and plugins. Safe to run any time — none of these tools touch the quote flow."
      />

      <SectionCard padding="none">
        <ul className="divide-y divide-line">
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="flex items-start justify-between gap-3 p-4 transition hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">
                    {tool.title}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-muted">
                    {tool.description}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-faint">
                    {tool.scope}
                  </div>
                </div>
                <span className="shrink-0 self-center text-ink-faint">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      <p className="mt-6 text-xs text-ink-faint">
        These pages never create contacts, properties, leads, quotes,
        quote_page_interactions, tasks, events, activities, or issues.
        Direct URLs (e.g. <code>/admin/geo-test</code>) still work — this hub
        is just the canonical entry point.
      </p>
    </AdminShell>
  );
}
