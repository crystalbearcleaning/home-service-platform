import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/core/auth/server";
import { getActiveBusinessForUser } from "@/core/business/active-business";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const business = await getActiveBusinessForUser(user.id);

  if (!business) {
    return (
      <main className="min-h-screen p-8 max-w-2xl mx-auto">
        <header className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">No business membership</h1>
            <p className="text-sm text-gray-600 mt-1">{user.email}</p>
          </div>
          <SignOutButton />
        </header>
        <p className="text-sm text-gray-700">
          Your account is not linked to a Crystal Bear membership. Run the
          seed script (<code>./supabase/seed/run_seed.sh</code>) after signing
          up with this email, or have an owner add you.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <header className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">{business.name}</h1>
          <p className="text-sm text-gray-600 mt-1">{user.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card label="Role" value={business.roleName ?? "—"} />
        <Card label="Workspace slug" value={business.slug} />
        <Card
          label="Seeded app surfaces"
          value={String(business.appSurfacesCount)}
        />
        <Card
          label="Seeded installed plugins"
          value={String(business.installedPluginsCount)}
        />
      </section>

      <nav className="mt-6 text-sm flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/admin/plugins"
          className="underline text-gray-700 hover:text-black"
        >
          Installed plugins →
        </Link>
        <Link
          href="/admin/activity"
          className="underline text-gray-700 hover:text-black"
        >
          Activity →
        </Link>
        <Link
          href="/admin/events"
          className="underline text-gray-700 hover:text-black"
        >
          Events →
        </Link>
        <Link
          href="/admin/geo-test"
          className="underline text-gray-700 hover:text-black"
        >
          Geo test →
        </Link>
        <Link
          href="/admin/property-data-test"
          className="underline text-gray-700 hover:text-black"
        >
          Property data test →
        </Link>
        <Link
          href="/admin/rate-limit-test"
          className="underline text-gray-700 hover:text-black"
        >
          Rate limit test →
        </Link>
      </nav>

      <p className="mt-10 text-xs text-gray-500">
        Phase 1 admin shell. Dashboard widgets, leads, quotes, and tasks
        will be added in later steps.
      </p>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
