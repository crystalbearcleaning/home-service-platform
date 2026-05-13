import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { AutoQuoteTestClient } from "./auto-quote-test-client";

export const dynamic = "force-dynamic";

export default async function AutoQuoteTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const business = await getActiveBusinessForUser(user.id);
  if (!business) redirect("/admin");

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold">Auto-Quote test</h1>
        <p className="text-sm text-gray-600 mt-1">
          Internal: exercise core geo + RentCast + Window Cleaning
          Auto-Quote Plugin calculation. No quote / lead / contact records
          are created.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          {business.name} · pricing rules pulled live from
          <code className="ml-1">price_rules</code>.
        </p>
      </header>

      <AutoQuoteTestClient />

      <p className="mt-10 text-xs text-gray-500">
        This page does not create contacts, properties, leads, quotes,
        quote_page_interactions, tasks, events, activities, or issues. It
        reads service_areas / services / service_plans / price_rules and
        hits Google + RentCast for the selected address.
      </p>
    </main>
  );
}
