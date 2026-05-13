import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { listActionKeys, phase1RateLimits } from "@/core/rate-limiter";
import {
  AdminShell,
  PageHeader,
  SectionCard,
  resolveAdminShellContext,
} from "@/components/admin";
import { SignOutButton } from "../sign-out-button";
import { RateLimitTestClient } from "./rate-limit-test-client";

export const dynamic = "force-dynamic";

export default async function RateLimitTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  const shell = resolveAdminShellContext({
    workspaceName: business.name,
    userEmail: user.email ?? "—",
  });

  const keys = listActionKeys();

  return (
    <AdminShell
      workspaceName={shell.workspaceName}
      userEmail={shell.userEmail}
      signOutSlot={<SignOutButton />}
      stagingToolsEnabled={shell.stagingToolsEnabled}
    >
      <PageHeader
        eyebrow="Testing tools"
        title="Rate limit test"
        description="Exercise checkRateLimit + recordRateLimitEvent without touching business tables. Writes to rate_limit_events only."
      />

      <SectionCard>
        <RateLimitTestClient actionKeys={keys} />
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Phase 1 defaults">
          <ul className="space-y-1 font-mono text-xs">
            {keys.map((key) => {
              const c = phase1RateLimits[key];
              if (!c) return null;
              const addr =
                c.maxPerAddress !== undefined
                  ? ` · ${c.maxPerAddress}/address`
                  : "";
              return (
                <li key={key}>
                  <span className="text-ink">{key}</span>{" "}
                  <span className="text-ink-faint">
                    · {c.maxPerIp}/ip · window {c.windowSeconds}s{addr}
                  </span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </AdminShell>
  );
}
