import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { listActionKeys, phase1RateLimits } from "@/core/rate-limiter";
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

  const keys = listActionKeys();

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Rate limit test</h1>
        <p className="text-sm text-gray-600 mt-1">
          Internal: exercise checkRateLimit + recordRateLimitEvent without
          touching business tables.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Writes go to <code>rate_limit_events</code> only. No contacts,
          properties, leads, quotes, tasks, events, activities, or issues
          are touched.
        </p>
      </header>

      <RateLimitTestClient actionKeys={keys} />

      <section className="mt-10 rounded border bg-white p-4 text-xs">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">
          Phase 1 defaults
        </h2>
        <ul className="space-y-1 font-mono">
          {keys.map((key) => {
            const c = phase1RateLimits[key];
            if (!c) return null;
            const addr =
              c.maxPerAddress !== undefined
                ? ` · ${c.maxPerAddress}/address`
                : "";
            return (
              <li key={key}>
                <span className="text-gray-900">{key}</span>{" "}
                <span className="text-gray-500">
                  · {c.maxPerIp}/ip · window {c.windowSeconds}s{addr}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
