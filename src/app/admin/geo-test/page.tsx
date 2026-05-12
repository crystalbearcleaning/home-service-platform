import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { GeoTestClient } from "./geo-test-client";

export const dynamic = "force-dynamic";

export default async function GeoTestPage() {
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
        <h1 className="text-2xl font-semibold">Geo test</h1>
        <p className="text-sm text-gray-600 mt-1">
          Internal: exercise the core geo provider (Google Places + service
          area match) without touching the quote flow.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          {business.name} · service areas seeded: Boynton Beach, Boca Raton,
          Delray Beach.
        </p>
      </header>

      <GeoTestClient />

      <p className="mt-10 text-xs text-gray-500">
        This page does not create contacts, properties, leads, quotes,
        tasks, events, or activities. It only reads service_areas.
      </p>
    </main>
  );
}
